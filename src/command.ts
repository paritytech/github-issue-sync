import { spawn } from "child_process"

import { Logger } from "./logging"

type ExecutorConfiguration = {
  logger: Logger
}

export class Executor {
  constructor(private configuration: ExecutorConfiguration) {}

  public run = async (execPath: string, args: string[]): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(execPath, args, { stdio: "pipe" })
      child.on("error", (error) => {
        reject(error)
      })

      let stdoutBuf = ""
      let stderrBuf = ""
      const getStreamHandler = (channel: "stdout" | "stderr") => {
        return (data: { toString: () => string }) => {
          const str = data.toString()
          switch (channel) {
            case "stdout": {
              stdoutBuf += str
              break
            }
            case "stderr": {
              stderrBuf += str
              break
            }
            default: {
              const exhaustivenessCheck: never = channel
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              throw new Error(`Not exhaustive: ${exhaustivenessCheck}`)
            }
          }
        }
      }

      child.stdout.on("data", getStreamHandler("stdout"))
      child.stderr.on("data", getStreamHandler("stdout"))

      child.on("close", async (exitCode) => {
        if (exitCode) {
          reject(new Error(stderrBuf))
        } else {
          resolve(stdoutBuf)
        }
      })
    })
  }
}
