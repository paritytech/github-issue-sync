import { getInput } from "@actions/core"
import { context, getOctokit } from "@actions/github"
import assert from "assert"

import { syncIssue } from "./core"

const main = async function () {
  const {
    payload: { issue },
    repo: { owner: organization },
  } = context
  assert(issue, "Issue was not found in the event's payload")

  const issueNodeId: string | undefined = issue.node_id
  assert(
    typeof issueNodeId === "string",
    'Issue payload did not have "node_id"',
  )

  const token = getInput("token", { required: true })
  const graphql = getOctokit(token).graphql.defaults({
    headers: { authorization: `token ${token}` },
  })
  const projectTargetField = getInput("target-project-field", {
    required: true,
  })
  const projectTargetValue = getInput("target-project-field-value", {
    required: true,
  })
  const projectNumber = parseInt(getInput("project", { required: true }))
  assert(projectNumber, "Invalid project board")

  await syncIssue({
    issue: { nodeId: issueNodeId },
    organization,
    graphql,
    project: {
      number: projectNumber,
      targetField: projectTargetField,
      targetValue: projectTargetValue,
    },
  })
}

void main()
