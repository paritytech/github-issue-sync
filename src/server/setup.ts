import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/core";
import pg from "pg";
import { Probot, Server } from "probot";

import { getOctokit } from "src/github";
import { LogFormat, Logger } from "src/logging";
import { ToRequired } from "src/types";

import { Configuration as ApiConfiguration, setupApi } from "./api";
import { withDatabaseClientCallback, withDatabaseClientForDynamicQueryCallback } from "./database";
import { setupBotEvents } from "./event";
import { Context } from "./types";

const setupHealthRoute = (server: Server) => {
  server.expressApp.get("/health", (_, response) => {
    response.status(200).send();
  });
};

export const setup = (
  logger: Logger,
  bot: Probot,
  server: Server,
  logFormat: LogFormat,
  conf: {
    github: {
      appId: number;
      clientId: string;
      clientSecret: string;
      privateKey: string;
    };
    database: ToRequired<Pick<pg.ClientConfig, "user" | "host" | "database" | "password" | "port">>;
    api: ApiConfiguration;
  },
) => {
  const appAuth = createAppAuth(conf.github);
  const getInstallationOctokit = (loggerInstance: Logger, installationId: number | undefined) =>
    getOctokit(
      new Octokit(),
      async () => {
        const token = (await appAuth({ type: "installation", installationId })).token;
        return { authorization: `Bearer ${token}` };
      },
      loggerInstance,
    );

  const databaseApplicationPool = new pg.Pool(conf.database);
  databaseApplicationPool.on("error", (err) => {
    logger.error(err, "Unexpected error on idle database client for the application's pool");
  });

  const ctx: Context = {
    logger,
    github: { getInstallationOctokit },
    bot,
    database: {
      wrap: withDatabaseClientCallback(databaseApplicationPool, logger, () => undefined),
      wrapForDynamicQuery: withDatabaseClientForDynamicQueryCallback(databaseApplicationPool, logger),
    },
  };

  setupBotEvents(ctx);
  setupApi(ctx, server, conf.api);
  setupHealthRoute(server);
};
