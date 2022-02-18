import { graphql as OctokitGraphQL } from "@octokit/graphql"
import assert from "assert"
import Joi from "joi"

import { Issue } from "./types"

export const syncIssue = async function ({
  issue,
  graphql: gql,
  project,
  organization,
}: {
  issue: Issue
  graphql: typeof OctokitGraphQL
  project: { number: number; targetField: string; targetValue: string }
  organization: string
}) {
  /*

    Step: Fetch the project's data so that we'll be able to create an item on it
    for the issue given as input

  */
  const projectData = await gql<{
    organization: {
      projectNext: {
        id: string
        fields: {
          nodes: {
            id: string
            name: string
            settings?: string | null
          }[]
        }
      }
    }
  }>(
    `
    query($organization: String!, $number: Int!) {
      organization(login: $organization){
        projectNext(number: $number) {
          id
          fields(first: 20) {
            nodes {
              id
              name
              settings
            }
          }
        }
      }
    }
  `,
    { organization, number: project.number },
  )

  /*

    Step: Find the target field which we were given as input

  */
  const targetField = projectData.organization.projectNext.fields.nodes.find(
    function ({ name }) {
      return name === project.targetField
    },
  )
  assert(
    targetField,
    `No field named "${project.targetField}" was found in the project`,
  )

  assert(
    targetField.settings,
    `Settings for the field "${project.targetField}" are empty`,
  )
  const parsedSettings = JSON.parse(targetField.settings)

  const settingsValidator = Joi.object<{
    options: [{ id: string; name: string }]
  }>()
    .keys({ options: Joi.array().items(Joi.object()) })
    .options({ allowUnknown: true, skipFunctions: true })
  const settingsResult = settingsValidator.validate(parsedSettings)
  assert(settingsResult.error === undefined, settingsResult.error)
  const { value: settings } = settingsResult

  /*

    Step: Find the target value given as input in the possible values for the
    target field

  */
  const targetValue = settings.options.find(function ({ name }) {
    return name === project.targetValue
  })
  assert(
    targetValue,
    `No value named "${project.targetValue}" was found for the "${project.targetField}" field`,
  )

  /*

    Step: Create an item for the issue in the board

  */
  const createItemResult = await gql<{
    addProjectNextItem: { projectNextItem: { id: string } }
  }>(
    `
    mutation($project: ID!, $issue: ID!) {
      addProjectNextItem(input: {projectId: $project, contentId: $issue}) {
        projectNextItem {
          id
        }
      }
    }
  `,
    { project: projectData.organization.projectNext.id, issue: issue.nodeId },
  )

  /*

    Step: Assign the issue to the target field and value we were given as input
    Apparently it's not (yet?) possible to provide this assignment in the
    initial mutation, hence why two separate requests are made.

  */
  await gql(
    `
    mutation (
      $project: ID!
      $item: ID!
      $targetField: ID!
      $targetFieldValue: ID!
    ) {
      updateProjectNextItemField(input: {
        projectId: $project
        itemId: $item
        fieldId: $targetField
        value: $targetFieldValue
      }) {
        projectNextItem {
          id
        }
      }
    }
  `,
    {
      project: projectData.organization.projectNext.id,
      item: createItemResult.addProjectNextItem.projectNextItem.id,
      targetField: targetField.id,
      targetFieldValue: targetValue.id,
    },
  )
}
