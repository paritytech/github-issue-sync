import * as core from "@actions/core";
import { ILogger } from "./types";

/** Implementation using the logger type from @actions/core */
export class CoreLogger implements ILogger {
    info(message: string): void {
        core.info(message);
    }
    warning(message: string): void {
        core.warning(message);
    }
    error(message: string | Error): void {
        core.error(message);
    }
    debug(message: string): void {
        core.debug(message);
    }
    notice(message: string): void {
        core.notice(message);
    }

}
