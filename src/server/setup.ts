import { createAppAuth } from "@octokit/auth-app"
import { Octokit } from "@octokit/core"
import pg from "pg"
import { Probot, Server } from "probot"

import { getOctokit } from "src/github"
import { LogFormat, Logger } from "src/logging"
import { ToRequired } from "src/types"

import { Configuration as ApiConfiguration, setupApi } from "./api"
import {
  withDatabaseClientCallback,
  withDatabaseClientForDynamicQueryCallback,
} from "./database"
import { setupBotEvents } from "./event"
import { Context } from "./types"

export const setup = (
  bot: Probot,
  server: Server,
  logFormat: LogFormat,
  conf: {
    github: {
      appId: number
      clientId: string
      clientSecret: string
      privateKey: string
    }
    database: ToRequired<
      Pick<pg.ClientConfig, "user" | "host" | "database" | "password" | "port">
    >
    api: ApiConfiguration
  },
) => {
  const logger = new Logger({
    logFormat,
    name: "github-issue-sync",
    minLogLevel: "debug",
  })

  const appAuth = createAppAuth(conf.github)
  const getInstallationOctokit = (installationId: number | undefined) => {
    return getOctokit(
      new Octokit(),
      async () => {
        const token = (await appAuth({ type: "installation", installationId }))
          .token
        return { authorization: `Bearer ${token}` }
      },
      logger,
    )
  }

  const databaseApplicationPool = new pg.Pool(conf.database)
  databaseApplicationPool.on("error", (err) => {
    logger.error(
      err,
      "Unexpected error on idle database client for the application's pool",
    )
  })

  const ctx: Context = {
    logger,
    github: { getInstallationOctokit },
    bot,
    database: {
      wrap: withDatabaseClientCallback(databaseApplicationPool, logger, () => {
        return undefined
      }),
      wrapForDynamicQuery: withDatabaseClientForDynamicQueryCallback(
        databaseApplicationPool,
        logger,
      ),
    },
  }

  setupBotEvents(ctx)
  setupApi(ctx, server, conf.api)
}
