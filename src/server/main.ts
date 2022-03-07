import { Logger as ProbotLogger, Probot, Server } from "probot"
import { getLog } from "probot/lib/helpers/get-log"

import { Logger } from "src/logging"
import { envNumberVar, envVar } from "src/utils"

import { setup } from "./setup"

const main = async () => {
  const apiControlToken = envVar("API_CONTROL_TOKEN")

  const serverPort = envNumberVar("PORT")

  const logFormat = (() => {
    const logFormatVar = envVar("LOG_FORMAT")
    switch (logFormatVar) {
      case "json":
      case "none": {
        return logFormatVar
      }
      default: {
        throw new Error(`Invalid LOG_FORMAT: ${logFormatVar}`)
      }
    }
  })()

  const logger = new Logger({ logFormat, name: "app", minLogLevel: "debug" })

  let isTerminating = false
  for (const event of ["uncaughtException", "unhandledRejection"]) {
    process.on(event, (error, origin) => {
      if (isTerminating) {
        return
      }
      isTerminating = true

      switch (logFormat) {
        case "json": {
          console.error({ level: "error", event, error, context: origin })
          break
        }
        default: {
          console.error(event, origin, error)
        }
      }

      process.exit(1)
    })
  }

  const appId = envNumberVar("APP_ID")

  const privateKeyBase64 = envVar("PRIVATE_KEY_BASE64")
  const privateKey = Buffer.from(privateKeyBase64, "base64").toString()

  const clientId = envVar("CLIENT_ID")
  const clientSecret = envVar("CLIENT_SECRET")
  const webhookSecret = envVar("WEBHOOK_SECRET")

  const database = {
    user: envVar("DB_USER"),
    host: envVar("DB_HOST"),
    password: envVar("DB_PASSWORD"),
    database: envVar("DB_NAME"),
    port: envNumberVar("DB_PORT"),
  }

  let probotLogger: ProbotLogger | undefined = undefined
  switch (logFormat) {
    case "json": {
      probotLogger = getLog({
        logFormat,
        level: "info",
        logLevelInString: true,
        logMessageKey: "msg",
      })
      break
    }
  }

  const bot = Probot.defaults({
    appId,
    privateKey,
    secret: webhookSecret,
    logLevel: "error",
    ...(probotLogger === undefined
      ? {}
      : { log: probotLogger.child({ name: "probot" }) }),
  })

  const server = new Server({
    Probot: bot,
    port: serverPort,
    ...(probotLogger === undefined
      ? {}
      : { log: probotLogger.child({ name: "server" }) }),
    webhookProxy: process.env.WEBHOOK_PROXY_URL,
  })
  await server.load((bot: Probot) => {
    return setup(bot, server, logFormat, {
      database,
      github: { appId, clientId, clientSecret, privateKey },
      api: { controlToken: apiControlToken },
    })
  })

  await server.start()
  logger.info("Probot has started!")
}

void main()
