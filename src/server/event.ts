import { EmitterWebhookEvent as WebhookEvent } from "@octokit/webhooks"
import { EmitterWebhookEventName as WebhookEvents } from "@octokit/webhooks/dist-types/types"

import { Executor } from "src/command"
import { syncIssue } from "src/core"

import { table } from "./database"
import { Context, IssueToProjectFieldRule } from "./types"

type WebhookHandler<E extends WebhookEvents> = (
  ctx: Context,
  event: WebhookEvent<E>,
) => void | Promise<void>

const setupEvent = <E extends WebhookEvents>(
  ctx: Context,
  eventName: E,
  handler: WebhookHandler<E>,
) => {
  const { bot, logger } = ctx
  bot.on(eventName, async (event) => {
    const eventLogger = logger.child({ eventId: event.id, eventName })
    const { octokit: _, log: __, ...relevantEventPartsForLogging } = event
    eventLogger.info(relevantEventPartsForLogging, "Received payload")
    await handler({ ...ctx, logger: eventLogger }, event)
  })
}

export const setupBotEvents = (ctx: Context) => {
  for (const event of [
    "issues.opened",
    "issues.labeled",
    "issues.reopened",
  ] as const) {
    setupEvent(ctx, event, async ({ logger }, event) => {
      const { payload } = event

      const rules = await ctx.database.wrap(async (client) => {
        const { rows }: { rows: IssueToProjectFieldRule[] } =
          await client.query(
            `
          SELECT * FROM ${table.issue_to_project_field_rule}
          WHERE
            github_owner = $1 AND
            github_name = $2
          `,
            [payload.repository.owner.login, payload.repository.name],
          )
        return rows
      })

      const octokit = ctx.github.getInstallationOctokit(
        payload.installation?.id,
      )

      const executor = new Executor({ logger, secretsToRedact: [] })

      toNextRule: for (const rule of rules) {
        try {
          if (rule.filter) {
            const inputVarName = "input"
            const result = await executor.run("jq", [
              "-r",
              "-n",
              "--argjson",
              inputVarName,
              JSON.stringify(payload.issue),
              "-r",
              `$${inputVarName} | ${rule.filter}`,
            ])
            if (!result.length) {
              continue toNextRule
            }
          }

          await syncIssue({
            issue: { nodeId: payload.issue.node_id },
            graphql: octokit.graphql,
            project: {
              number: rule.project_number,
              targetField: rule.project_field,
              targetValue: rule.project_field_value,
            },
            organization: rule.github_owner,
          })
        } catch (error) {
          logger.error({ rule, error }, "Caught error while processing rule")
        }
      }
    })
  }
}
