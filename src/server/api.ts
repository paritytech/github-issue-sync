import bodyParser from "body-parser";
import { Request, RequestHandler, Response } from "express";
import Joi from "joi";
import { Server } from "probot/lib/server/server";

import { ToOptional } from "src/types";
import { Ok } from "src/utils";

import { DynamicQueryParam, table } from "./database";
import { Context, IssueToProjectFieldRule } from "./types";

enum ApiVersion {
  v1 = "v1",
}

const getApiRoute = (version: ApiVersion, route: string) => `/api/${version}/${route}`;

const routes = (() => {
  const issueToProjectFieldRuleRoute = "rule" as const;
  const issueToProjectFieldRuleByIdRoute = `${issueToProjectFieldRuleRoute}/:id` as const;
  const issueToProjectFieldRuleRouteByOwnerAndName = `${issueToProjectFieldRuleRoute}/repository/:owner/:name` as const;

  const tokenRoute = "token" as const;

  return {
    token: { root: tokenRoute },
    issueToProjectField: {
      root: issueToProjectFieldRuleRoute,
      byId: issueToProjectFieldRuleByIdRoute,
      byRepository: issueToProjectFieldRuleRouteByOwnerAndName,
    },
  };
})();

const requestParamValidators = {
  [routes.token.root]: undefined,
  [routes.issueToProjectField.root]: undefined,
  [routes.issueToProjectField.byId]: Joi.object<{
    id: string;
  }>().keys({ id: Joi.string().required() }),
  [routes.issueToProjectField.byRepository]: Joi.object<{
    owner: string;
    name: string;
  }>().keys({ owner: Joi.string().required(), name: Joi.string().required() }),
};

export type Configuration = { controlToken: string };

type CurriedRespond = (code: number, body?: string | Record<string, any>) => void;

const respond = (res: Response, ...[code, body]: Parameters<CurriedRespond>) => {
  if (body === undefined) {
    res.status(code).send();
  } else {
    res.status(code).json(body);
  }
};

const respondWithError = (res: Response, ...[code, body]: Parameters<CurriedRespond>) => {
  respond(res, code, body === undefined ? undefined : typeof body === "string" ? { error: body } : body);
};

const jsonParserMiddleware = bodyParser.json();

export const setupApi = ({ database, logger }: Context, server: Server, configuration: Configuration) => {
  const checkAuthToken = async (req: Request, { checkApiKey }: { checkApiKey?: boolean } = {}) => {
    const token = req.headers["x-auth"];
    if (typeof token !== "string") {
      return "Invalid token format";
    }

    const invalidationReason = await (async () => {
      if (checkApiKey) {
        if (token !== configuration.controlToken) {
          return "Token did not match $API_CONTROL_TOKEN";
        }
      } else {
        const { rowCount } = await database.wrap(
          async (client) =>
            await client.query(
              `
            SELECT 1
            FROM ${table.token}
            WHERE token = $1
            `,
              [token],
            ),
        );
        if (rowCount === 0) {
          return "Token not found";
        }
      }
    })();

    if (invalidationReason !== undefined) {
      return invalidationReason;
    }

    return new Ok(token);
  };

  const setupRoute = <T extends "post" | "get" | "delete" | "patch", Path extends keyof typeof requestParamValidators>(
    method: T,
    apiVersion: ApiVersion,
    path: Path,
    handler: (requestContext: {
      ok: CurriedRespond;
      err: CurriedRespond;
      req: Parameters<RequestHandler>[0];
      res: Parameters<RequestHandler>[1];
      reqParamsValidator: typeof requestParamValidators[Path];
      token: string;
    }) => Promise<void>,
    options: { checkApiKey?: boolean } = {},
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    server.expressApp[method](getApiRoute(apiVersion, path), jsonParserMiddleware, async (req, res) => {
      const tokenValidation = await checkAuthToken(req, options);
      if (!(tokenValidation instanceof Ok)) {
        return respondWithError(res, 403, tokenValidation);
      }
      const { value: token } = tokenValidation;

      const err = (...params: Parameters<CurriedRespond>) => respondWithError(res, ...params);
      try {
        await handler({
          ok: (...params: Parameters<CurriedRespond>) => respond(res, ...params),
          err,
          req,
          res,
          reqParamsValidator: requestParamValidators[path],
          token,
        });
      } catch (error) {
        const message = "Failed to handle errors in API endpoint";
        logger.error(error, message);
        err(500, message);
      }
    });
  };

  setupRoute("get", ApiVersion.v1, routes.issueToProjectField.root, async ({ ok }) => {
    const { rows } = await database.wrap(
      async (client) => await client.query(`SELECT * FROM ${table.issue_to_project_field_rule}`),
    );
    ok(200, rows);
  });

  setupRoute("get", ApiVersion.v1, routes.issueToProjectField.byId, async ({ ok, err, req, reqParamsValidator }) => {
    const reqParamsValidation = reqParamsValidator.validate(req.params);
    if (reqParamsValidation.error) {
      return err(422, reqParamsValidation.error);
    }
    const params = reqParamsValidation.value;

    const id = parseInt(params.id);
    if (isNaN(id)) {
      return err(422, "Invalid id");
    }

    const { rows, rowCount } = await database.wrap(
      async (client) =>
        await client.query(
          `
          SELECT *
          FROM ${table.issue_to_project_field_rule}
          WHERE id = $1
          `,
          [id],
        ),
    );

    ok(rowCount ? 200 : 404, rows[0]);
  });

  setupRoute(
    "delete",
    ApiVersion.v1,
    routes.issueToProjectField.byRepository,
    async ({ ok, err, req, reqParamsValidator }) => {
      const reqParamsValidation = reqParamsValidator.validate(req.params);
      if (reqParamsValidation.error) {
        return err(422, reqParamsValidation.error);
      }
      const params = reqParamsValidation.value;

      const { rows, rowCount } = await database.wrap(
        async (client) =>
          await client.query(
            `
          DELETE FROM ${table.issue_to_project_field_rule}
          WHERE
            github_owner = $1 AND
            github_name = $2
          RETURNING *
          `,
            [params.owner, params.name],
          ),
      );

      ok(rowCount ? 200 : 404, rows);
    },
  );

  setupRoute("delete", ApiVersion.v1, routes.issueToProjectField.byId, async ({ ok, err, req, reqParamsValidator }) => {
    const reqParamsValidation = reqParamsValidator.validate(req.params);
    if (reqParamsValidation.error) {
      return err(422, reqParamsValidation.error);
    }
    const params = reqParamsValidation.value;

    const id = parseInt(params.id);
    if (isNaN(id)) {
      return err(422, "Invalid id");
    }

    const { rows, rowCount } = await database.wrap(
      async (client) =>
        await client.query(
          `
          DELETE FROM ${table.issue_to_project_field_rule}
          WHERE id = $1
          RETURNING *
          `,
          [id],
        ),
    );

    ok(rowCount ? 200 : 404, rows[0]);
  });

  /*
     For project_field and project_field_value, having the schema organized this
     way yields better error messages than Joi.alternative()
  */
  const commonIssueToProjectFieldRuleCreationSchemaKeys = {
    project_field: Joi.string()
      .allow(null)
      /*
        We use ".." (the reference to the shared parent object of project_field
        and project_field since they're both on the same level in the payload's
        hierarchy) here because project_field and project_field_value value
        depend on one another, but Joi doesn't support circular references
      */
      .when("..", {
        switch: [
          // If project_field_value is null, project_field should also be null
          {
            is: Joi.object()
              .keys({ project_field_value: Joi.valid(null).required() })
              .options({ allowUnknown: true }),
            then: Joi.valid(null).required(),
          },
          {
            // If project_field_value is a string, project_field should also be a string
            is: Joi.object().keys({ project_field_value: Joi.string().required() }).options({ allowUnknown: true }),
            then: Joi.string().required(),
          },
        ],
      }),
    project_field_value: Joi.string()
      .allow(null)
      /*
         We use ".." (the reference to the shared parent object of project_field
         and project_field since they're both on the same level in the payload's
         hierarchy) here because project_field and project_field_value value
         depend on one another, but Joi doesn't support circular references
      */
      .when("..", {
        switch: [
          // If project_field is null, project_field_value should also be null
          {
            is: Joi.object()
              .keys({ project_field: Joi.valid(null).required() })
              .options({ allowUnknown: true }),
            then: Joi.valid(null).required(),
          },
          {
            // If project_field is a string, project_field_value should also be a string
            is: Joi.object().keys({ project_field: Joi.string().required() }).options({ allowUnknown: true }),
            then: Joi.string().required(),
          },
        ],
      }),
    filter: Joi.string().allow(null),
  };

  const issueToProjectFieldRuleCreationSchema = Joi.object<Omit<IssueToProjectFieldRule, "id">>().keys({
    ...commonIssueToProjectFieldRuleCreationSchemaKeys,
    project_number: Joi.number().required(),
  });

  setupRoute(
    "post",
    ApiVersion.v1,
    routes.issueToProjectField.byRepository,
    async ({ ok, err, req, reqParamsValidator }) => {
      const reqParamsValidation = reqParamsValidator.validate(req.params);
      if (reqParamsValidation.error) {
        return err(422, reqParamsValidation.error);
      }
      const params = reqParamsValidation.value;

      const { body }: { body: Record<string, any> } = req;
      const bodyValidation = issueToProjectFieldRuleCreationSchema.validate(body);
      if (bodyValidation.error) {
        return err(422, bodyValidation.error);
      }

      const { value: payload } = bodyValidation;
      const queryParams: DynamicQueryParam[] = Object.entries(payload).map(([column, value]) => {
        return { column, value };
      });
      if (queryParams.length === 0) {
        return err(422, "Should provide at least one column");
      }

      const rowCountResult = await database.wrapForDynamicQuery(
        [
          ...queryParams,
          { column: "github_owner", value: params.owner },
          { column: "github_name", value: params.name },
        ],
        async (client, { paramsPlaceholdersJoined, values, columnsJoined }) => {
          const { rowCount } = await client.query(
            `
            INSERT INTO ${table.issue_to_project_field_rule} (${columnsJoined})
            VALUES (${paramsPlaceholdersJoined})
            RETURNING *
            `,
            values,
          );
          return rowCount;
        },
      );

      ok(rowCountResult ? 201 : 404);
    },
  );

  setupRoute(
    "get",
    ApiVersion.v1,
    routes.issueToProjectField.byRepository,
    async ({ ok, err, reqParamsValidator, req }) => {
      const reqParamsValidation = reqParamsValidator.validate(req.params);
      if (reqParamsValidation.error) {
        return err(422, reqParamsValidation.error);
      }
      const params = reqParamsValidation.value;

      const { rows } = await database.wrap((client) =>
        client.query(
          `
          SELECT *
          FROM ${table.issue_to_project_field_rule}
          WHERE
            github_owner = $1 AND
            github_name = $2
          `,
          [params.owner, params.name],
        ),
      );

      ok(200, rows);
    },
  );

  const issueToProjectFieldRuleUpdateSchema = Joi.object<ToOptional<Omit<IssueToProjectFieldRule, "id">>>().keys({
    ...commonIssueToProjectFieldRuleCreationSchemaKeys,
    github_owner: Joi.string(),
    github_name: Joi.string(),
    project_number: Joi.number(),
  });
  setupRoute("patch", ApiVersion.v1, routes.issueToProjectField.byId, async ({ ok, err, req, reqParamsValidator }) => {
    const reqParamsValidation = reqParamsValidator.validate(req.params);
    if (reqParamsValidation.error) {
      return err(422, reqParamsValidation.error);
    }
    const params = reqParamsValidation.value;

    const id = parseInt(params.id);
    if (isNaN(id)) {
      return err(422, "Invalid id");
    }

    const { body }: { body: Record<string, any> } = req;
    const bodyValidation = issueToProjectFieldRuleUpdateSchema.validate(body);
    if (bodyValidation.error) {
      return err(422, bodyValidation.error);
    }

    const { value: payload } = bodyValidation;
    const queryParams: DynamicQueryParam[] = Object.entries(payload).map(([column, value]) => {
      return { column, value };
    });
    if (queryParams.length === 0) {
      return err(422, "Should provide at least one column");
    }

    const { rows, rowCount } = await database.wrapForDynamicQuery(
      queryParams,
      async (client, { updateStatementParamsJoined, values }) => {
        // eslint-disable-next-line @typescript-eslint/no-shadow
        const { rows, rowCount } = await client.query(
          `
            UPDATE ${table.issue_to_project_field_rule}
            SET ${updateStatementParamsJoined}
            WHERE id = $${values.length + 1}
            RETURNING *
            `,
          [...values, id],
        );
        return { rows, rowCount };
      },
    );

    ok(rowCount ? 200 : 404, rows[0]);
  });

  const tokenCreationSchema = Joi.object<{ description: string }>().keys({ description: Joi.string() });
  setupRoute(
    "post",
    ApiVersion.v1,
    routes.token.root,
    async ({ ok, err, req }) => {
      const { body }: { body: Record<string, any> } = req;
      const bodyValidation = tokenCreationSchema.validate(body);
      if (bodyValidation.error) {
        return err(422, bodyValidation.error);
      }
      const { description } = bodyValidation.value;

      const { rows } = await database.wrap(
        async (client) =>
          await client.query(
            `
            INSERT INTO ${table.token} (description)
            VALUES ($1)
            RETURNING *
          `,
            [description],
          ),
      );

      ok(201, rows);
    },
    { checkApiKey: true },
  );

  setupRoute("delete", ApiVersion.v1, routes.token.root, async ({ ok, token }) => {
    const { rowCount } = await database.wrap(
      async (client) =>
        await client.query(
          `
          DELETE FROM ${table.token}
          WHERE token = $1
        `,
          [token],
        ),
    );
    ok(rowCount ? 200 : 404);
  });
};
