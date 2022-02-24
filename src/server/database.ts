import pg from "pg"

import { Logger } from "src/logging"
import { delayMilliseconds } from "src/utils"

type Tables<T extends string> = { [K in T]: `public.${K}` }
export const table: Tables<"issue_to_project_field_rule" | "token"> = {
  issue_to_project_field_rule: "public.issue_to_project_field_rule",
  token: "public.token",
}

const acquirePoolClient = (pool: pg.Pool, logger: Logger) => {
  return async () => {
    let client: pg.PoolClient | undefined = undefined

    acquireClientLoop: for (let i = 0; i < 3; i++) {
      const acquiredClient: pg.PoolClient & { hasTestQueryWorked?: true } =
        await pool.connect()

      if (acquiredClient.hasTestQueryWorked) {
        client = acquiredClient
        break acquireClientLoop
      } else {
        for (let j = 0; j < 3; j++) {
          try {
            await acquiredClient.query("SELECT 1")
            acquiredClient.hasTestQueryWorked = true
          } catch (error) {
            logger.warn(
              `Acquired client has failed the test query on try #${j}. Retrying...`,
            )
          }
          if (acquiredClient.hasTestQueryWorked) {
            client = acquiredClient
            break acquireClientLoop
          } else {
            // Wait before trying the test query again
            logger.info(
              "Test query failed upon acquiring database client. Retrying...",
            )
            await delayMilliseconds(1024)
          }
        }
        // We've tried the test query but it did not work; assume this client is broken
        try {
          // FIXME: We have to manually make the "end" method available in the
          // type here because the @types/pg package incorrectly does not
          // include it.
          await (
            acquiredClient as unknown as { end: () => Promise<void> }
          ).end()
        } finally {
          acquiredClient.release()
        }
      }
    }

    if (client === undefined) {
      throw new Error("Failed to acquire a database client")
    }

    return client
  }
}

export type WithDatabaseClient<T, WrapperContext = undefined> = (
  client: pg.PoolClient,
  context: WrapperContext,
) => T | Promise<T>
export const withDatabaseClientCallback = function <
  T,
  WrapperContext = undefined,
>(
  pool: pg.Pool,
  logger: Logger,
  getQueryContext: (client: pg.PoolClient) => WrapperContext,
) {
  return async (fn: WithDatabaseClient<T, WrapperContext>) => {
    let result: T | Error
    const client = await acquirePoolClient(pool, logger)()
    try {
      result = await fn(client, getQueryContext(client))
    } catch (error) {
      result = error
    } finally {
      client.release()
    }
    if (result instanceof Error) {
      throw result
    }
    return result
  }
}

export type DynamicQueryParam = {
  column: string
  value: any
}
type WrapForDynamicQueryContext = {
  paramsPlaceholdersJoined: string
  updateStatementParamsJoined: string
  values: any[]
  columnsJoined: string
}
export type WithDatabaseClientForDynamicQuery<T> = (
  inputParams: DynamicQueryParam[],
  fn: WithDatabaseClient<T, WrapForDynamicQueryContext>,
) => T | Promise<T>

export const withDatabaseClientForDynamicQueryCallback = <T>(
  pool: pg.Pool,
  logger: Logger,
) => {
  return async (
    ...[inputParams, fn]: Parameters<WithDatabaseClientForDynamicQuery<T>>
  ) => {
    const queryParams = inputParams.map((change, i) => {
      return { ...change, placeholder: `$${i + 1}` }
    })

    const columns = queryParams.map(({ column }) => {
      return column
    })

    const paramsPlaceholdersJoined = queryParams
      .reduce((acc, { placeholder }) => {
        return `${acc}, ${placeholder}`
      }, "")
      .slice(1)
      .trim()

    const values = queryParams.map(({ value }) => {
      return value
    })

    return await withDatabaseClientCallback<T, WrapForDynamicQueryContext>(
      pool,
      logger,
      (client) => {
        const updateStatementParamsJoined = queryParams
          .reduce((acc, { placeholder, column }) => {
            return `${acc}, ${client.escapeIdentifier(column)} = ${placeholder}`
          }, "")
          .slice(1)
          .trim()
        const columnsJoined = columns
          .reduce((acc, v) => {
            return `${acc}, ${client.escapeIdentifier(v)}`
          }, "")
          .slice(1)
          .trim()
        return {
          paramsPlaceholdersJoined,
          updateStatementParamsJoined,
          values,
          columnsJoined,
          queryParams,
        }
      },
    )(fn)
  }
}
