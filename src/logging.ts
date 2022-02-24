enum LoggingLevel {
  debug,
  info,
  warn,
  error,
}
type LoggingLevels = keyof typeof LoggingLevel

export type LogFormat = "json" | "none"

export class Logger {
  constructor(
    public options: {
      name: string
      logFormat: LogFormat
      minLogLevel: LoggingLevels
      context?: Record<string, any>
    },
  ) {}

  child(context: Record<string, any>) {
    return new Logger({
      ...this.options,
      context: { ...this.options.context, ...context },
    })
  }

  private log(level: LoggingLevels, item: any, message?: string) {
    if (LoggingLevel[level] < LoggingLevel[this.options.minLogLevel]) {
      return
    }

    switch (this.options.logFormat) {
      case "json": {
        const base = {
          level,
          name: this.options.name,
          context:
            this.options.context === undefined
              ? message
              : { ...this.options.context, description: message },
        }

        // This structure is aligned with Probot's pino output format for JSON
        const logEntry: {
          level: string
          name: string
          msg: string
          stack?: string
          context?: any
        } = (() => {
          if (item instanceof Error) {
            return { ...base, stack: item.stack, msg: item.toString() }
          } else {
            return { ...base, msg: item }
          }
        })()

        console.log(JSON.stringify(logEntry))
        break
      }
      default: {
        const tag = `${level.toUpperCase()} (${this.options.name}):`
        const fn = item instanceof Error ? console.error : console.log
        fn(
          tag,
          ...[
            ...(message ? [message] : []),
            ...(this.options.context === undefined
              ? []
              : [JSON.stringify(this.options.context)]),
            item,
          ],
        )
        break
      }
    }
  }

  private loggerCallback(level: LoggingLevels) {
    return (item: any, message?: string) => {
      return this.log(level, item, message)
    }
  }
  debug = this.loggerCallback("debug")
  info = this.loggerCallback("info")
  warn = this.loggerCallback("warn")
  error = this.loggerCallback("error")
}
