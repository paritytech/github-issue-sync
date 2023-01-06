import { spawn } from "child_process";

import { Logger } from "./logging";

const redactSecrets = (str: string, secrets: string[] = []) => {
  for (const secret of secrets) {
    if (!secret) {
      continue;
    }
    str = str.replace(secret, "{SECRET}");
  }
  return str;
};

const displayCommand = ({
  execPath,
  args,
  secretsToRedact,
}: {
  execPath: string;
  args: string[];
  secretsToRedact: string[];
}) => redactSecrets(`${execPath} ${args.join(" ")}`, secretsToRedact);

type ExecutorConfiguration = {
  secretsToRedact: string[];
  logger: Logger;
  cwd?: string;
};

export class Executor {
  constructor(private configuration: ExecutorConfiguration) {}

  public run = async (execPath: string, args: string[]): Promise<string> =>
    await new Promise<string>((resolve, reject) => {
      const { cwd, secretsToRedact, logger } = this.configuration;

      const commandDisplayed = displayCommand({ execPath, args, secretsToRedact });
      logger.info(`Executing command ${commandDisplayed}`);

      const child = spawn(execPath, args, { cwd, stdio: "pipe" });
      child.on("error", (error) => {
        reject(error);
      });

      let stdoutBuf = "";
      let stderrBuf = "";
      const getStreamHandler = (channel: "stdout" | "stderr") => (data: { toString: () => string }) => {
        const str = redactSecrets(data.toString(), secretsToRedact);
        const strTrim = str.trim();

        if (strTrim && channel === "stdout") {
          logger.info(strTrim, channel);
        }

        switch (channel) {
          case "stdout": {
            stdoutBuf += str;
            break;
          }
          case "stderr": {
            stderrBuf += str;
            break;
          }
          default: {
            const exhaustivenessCheck: never = channel;
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            throw new Error(`Not exhaustive: ${exhaustivenessCheck}`);
          }
        }
      };

      child.stdout.on("data", getStreamHandler("stdout"));
      child.stderr.on("data", getStreamHandler("stderr"));

      child.on("close", (exitCode) => {
        logger.info({ exitCode }, `Finished command ${commandDisplayed}`);
        if (exitCode) {
          const stderr = redactSecrets(stderrBuf.trim(), secretsToRedact);
          reject(new Error(stderr));
        } else {
          const stdout = redactSecrets(stdoutBuf.trim(), secretsToRedact);
          resolve(stdout);
        }
      });
    });
}
