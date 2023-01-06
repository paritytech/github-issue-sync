import { graphql as OctokitGraphQL } from "@octokit/graphql";
import assert from "assert";
import Joi from "joi";

import { Issue } from "./types";

type ProjectData = {
  organization: {
    projectNext: {
      id: string;
      fields: {
        nodes: {
          id: string;
          name: string;
          settings?: string | null;
        }[];
      };
    };
  };
};

const fetchProjectData: (params: {
  gql: typeof OctokitGraphQL;
  organization: string;
  number: number;
}) => Promise<ProjectData> = ({ gql, organization, number }) =>
  gql<ProjectData>(
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
    { organization, number },
  );

const resolveProjectTargetField: (params: { projectData: ProjectData; targetField: string; targetValue: string }) => {
  targetFieldId: string;
  targetValueId: string;
} = ({ projectData, targetField, targetValue }) => {
  const targetFieldNode = projectData.organization.projectNext.fields.nodes.find(({ name }) => name === targetField);

  assert(targetFieldNode, `No field named "${targetField}" was found in the project`);

  assert(targetFieldNode.settings, `Settings for the field "${targetField}" are empty`);
  const parsedSettings = JSON.parse(targetFieldNode.settings);

  const settingsValidator = Joi.object<{
    options: [{ id: string; name: string }];
  }>()
    .keys({
      options: Joi.array().items(Joi.object().keys({ id: Joi.string().required(), name: Joi.string().required() })),
    })
    .options({ allowUnknown: true, skipFunctions: true });
  const settingsResult = settingsValidator.validate(parsedSettings);
  assert(settingsResult.error === undefined, settingsResult.error);
  const { value: settings } = settingsResult;

  const targetValueNode = settings.options.find(({ name }) => name === targetValue);
  assert(targetValueNode, `No value named "${targetValue}" was found for the "${targetField}" field`);

  return { targetFieldId: targetFieldNode.id, targetValueId: targetValueNode.id };
};

type CreatedProjectItemForIssue = {
  addProjectNextItem: { projectNextItem: { id: string } };
};

const createProjectItemForIssue: (params: {
  gql: typeof OctokitGraphQL;
  projectId: string;
  issueNodeId: string;
}) => Promise<CreatedProjectItemForIssue> = ({ gql, projectId, issueNodeId }) =>
  gql<CreatedProjectItemForIssue>(
    `
    mutation($project: ID!, $issue: ID!) {
      addProjectNextItem(input: {projectId: $project, contentId: $issue}) {
        projectNextItem {
          id
        }
      }
    }
  `,
    { project: projectId, issue: issueNodeId },
  );

const updateProjectNextItemField: (params: {
  gql: typeof OctokitGraphQL;
  project: string;
  item: string;
  targetField: string;
  targetFieldValue: string;
}) => Promise<void> = ({ gql, project, item, targetField, targetFieldValue }) =>
  gql(
    `
    mutation (
      $project: ID!
      $item: ID!
      $targetField: ID!
      $targetFieldValue: String!
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
    { project, item, targetField, targetFieldValue },
  );

export const syncIssue = async ({
  issue,
  graphql: gql,
  project,
  organization,
}: {
  issue: Issue;
  graphql: typeof OctokitGraphQL;
  project: {
    number: number;
    targetField: string | null;
    targetValue: string | null;
  };
  organization: string;
}) => {
  const projectData = await fetchProjectData({ gql, organization, number: project.number });

  const targetField =
    project.targetField && project.targetValue
      ? resolveProjectTargetField({ projectData, targetField: project.targetField, targetValue: project.targetValue })
      : null;

  const createdProjectItemForIssue = await createProjectItemForIssue({
    gql,
    projectId: projectData.organization.projectNext.id,
    issueNodeId: issue.nodeId,
  });

  if (targetField !== null) {
    /*
      Assign the issue to the target field and value we were given as input
      Apparently it's not (yet?) possible to provide this assignment in the
      initial mutation, hence why two separate requests are made.
    */
    await updateProjectNextItemField({
      gql,
      project: projectData.organization.projectNext.id,
      item: createdProjectItemForIssue.addProjectNextItem.projectNextItem.id,
      targetField: targetField.targetFieldId,
      targetFieldValue: targetField.targetValueId,
    });
  }
};
