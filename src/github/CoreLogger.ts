import * as core from "@actions/core";

import { ILogger } from "./types";

/** Implementation using the logger type from @actions/core */
export class CoreLogger implements ILogger {
  info(message: string): void {
    core.info(message);
  }
  warning(message: string | Error): void {
    core.warning(message);
  }
  error(message: string | Error): void {
    core.error(message);
  }
  debug(message: string, data?: Record<string, unknown>): void {
    if (!data) {
      core.debug(message);
    } else {
      core.debug(message + JSON.stringify(data));
    }
  }
  notice(message: string): void {
    core.notice(message);
  }
}
