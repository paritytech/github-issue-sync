import { Octokit } from "@octokit/core"
import { RequestError } from "@octokit/request-error"

import { ExtendedOctokit } from "src/types"

import { Logger } from "./logging"
import { delayMilliseconds } from "./utils"

const rateLimitRemainingHeader = "x-ratelimit-remaining"
const rateLimitResetHeader = "x-ratelimit-reset"
const retryAfterHeader = "retry-after"

export const extendedByApplication = Symbol()
export const getOctokit = (
  octokit: Octokit,
  getAuthHeaders: () => Promise<{ authorization: string }>,
  logger: Logger,
): ExtendedOctokit => {
  // Check that this Octokit instance has not been augmented before because
  // side-effects of this function should not be stacked; e.g. registering
  // request wrappers more than once will break the application
  if ((octokit as ExtendedOctokit)[extendedByApplication] === true) {
    return octokit as ExtendedOctokit
  }

  octokit.hook.wrap("request", async (request, options) => {
    let result: any

    try {
      for (let tryCount = 1; tryCount < 4; tryCount++) {
        if (tryCount > 1) {
          logger.info(`Retrying Octokit request (tries so far: ${tryCount})`)
        }

        const authHeaders = await getAuthHeaders()
        options.headers = { ...(options.headers ?? {}), ...authHeaders }

        try {
          result = await request(options)
        } catch (error) {
          result = error
        }

        if (!(result instanceof RequestError)) {
          break
        }

        const { status } = result
        // Those codes indicate that the request is malformed and thus there's no
        // point in retrying it
        if ([400, 401, 403, 404, 422].includes(status)) {
          break
        }

        const { response } = result
        if (response === undefined) {
          break
        }

        const waitDuration = (() => {
          // https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limit-http-headers
          if (Number(rateLimitRemainingHeader) === 0) {
            logger.warn(
              `API limits were hit! The "${rateLimitResetHeader}" header will be read to figure out until when we're supposed to wait...`,
            )
            const rateLimitResetHeaderValue =
              response.headers[rateLimitResetHeader]
            const resetEpoch = Number(rateLimitResetHeaderValue) * 1000
            if (Number.isNaN(resetEpoch)) {
              logger.error(
                rateLimitResetHeaderValue,
                `Header "${rateLimitResetHeader}" could not be parsed as epoch`,
              )
            } else {
              const currentEpoch = Date.now()
              const waitDuration = resetEpoch - currentEpoch
              if (waitDuration < 0) {
                logger.error(
                  { rateLimitResetHeaderValue, resetEpoch, currentEpoch },
                  `Parsed epoch value for "${rateLimitResetHeader}" is smaller than the current date`,
                )
              } else {
                logger.info(
                  `Waiting for ${waitDuration}ms until requests can be made again...`,
                )
                return waitDuration
              }
            }
          } /*
            https://docs.github.com/en/rest/guides/best-practices-for-integrators#dealing-with-secondary-rate-limits
          */ else if (response.headers[retryAfterHeader] !== undefined) {
            const waitDuration =
              Number(response.headers[retryAfterHeader]) * 1000
            if (Number.isNaN(waitDuration)) {
              logger.error(
                retryAfterHeader,
                `Header "${retryAfterHeader}" could not be parsed as seconds`,
              )
            } else {
              return waitDuration
            }
          }
        })()

        if (waitDuration) {
          logger.warn(
            `Waiting for ${waitDuration}ms until requests can be made again...`,
          )
          await delayMilliseconds(waitDuration)
        } else {
          break
        }
      }
    } catch (error) {
      result = error
    }

    if (result instanceof Error) {
      throw result
    }

    return result
  })

  const extendedOctokit = octokit as ExtendedOctokit
  extendedOctokit[extendedByApplication] = true
  return extendedOctokit
}
