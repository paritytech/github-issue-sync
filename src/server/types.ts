import { Probot } from "probot"

import { Logger } from "src/logging"
import { ExtendedOctokit } from "src/types"

import {
  WithDatabaseClient,
  WithDatabaseClientForDynamicQuery,
} from "./database"

export type Context = {
  bot: Probot
  github: {
    getInstallationOctokit: (
      logger: Logger,
      installationId: number | undefined,
    ) => ExtendedOctokit
  }
  logger: Logger
  database: {
    wrap: <T>(wrap: WithDatabaseClient<T>) => Promise<T>
    wrapForDynamicQuery: <T>(
      ...args: Parameters<WithDatabaseClientForDynamicQuery<T>>
    ) => ReturnType<WithDatabaseClientForDynamicQuery<T>>
  }
}

type IssueToProjectFieldRuleCreationInput = {
  project_number: number
  project_field: string | null
  project_field_value: string | null
  filter?: string | null
}
type IssueToProjectFieldRuleUpdateInput =
  IssueToProjectFieldRuleCreationInput & {
    github_owner: string
    github_name: string
  }
export type IssueToProjectFieldRule = IssueToProjectFieldRuleUpdateInput & {
  id: number
}
