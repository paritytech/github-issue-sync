import { graphql } from "@octokit/graphql";

import { ILogger, IProjectApi, Issue, Repository } from "./types";

type NodeData = { id: string; title: string };
type ProjectFields = { field: string; value: string };
type FieldData = { name: string; id: string; options?: { name: string; id: string }[] };

export const PROJECT_V2_QUERY: string = `
query($organization: String!, $number: Int!) {
  organization(login: $organization){
    projectV2(number: $number) {
      id
      title
    }
  }
}
`;

export const ADD_PROJECT_V2_ITEM_BY_ID_QUERY: string = `
mutation($project: ID!, $issue: ID!) {
  addProjectV2ItemById(input: {projectId: $project, contentId: $issue}) {
    item {
      id
    }
  }
}
`;

export const PROJECT_FIELD_ID_QUERY: string = `
query($project: ID!) {
  node(id: $project) {
    ... on ProjectV2 {
      fields(first: 20) {
        nodes {
          ... on ProjectV2Field {
            id
            name
          }
          ... on ProjectV2IterationField {
            id
            name
            configuration {
              iterations {
                startDate
                id
              }
            }
          }
          ... on ProjectV2SingleSelectField {
            id
            name
            options {
              id
              name
            }
          }
        }
      }
    }
  }
}
`;

export const UPDATE_PROJECT_V2_ITEM_FIELD_VALUE_QUERY: string = `
mutation (
  $project: ID!
  $item: ID!
  $targetField: ID!
  $targetFieldValue: String!
) {
  updateProjectV2ItemFieldValue(
    input: {
      projectId: $project
      itemId: $item
      fieldId: $targetField
      value: {
        singleSelectOptionId: $targetFieldValue
        }
      }
    ) {
    projectV2Item {
      id
    }
  }
}
`;

/**
 * Instance that manages the GitHub's project api
 * ? Octokit.js doesn't support Project v2 API yet so we need to use graphQL
 * Used this blog post as a reference for the queries: https://www.cloudwithchris.com/blog/automate-adding-gh-issues-projects-beta/
 */
export class ProjectKit implements IProjectApi {
  private projectNode: NodeData | null = null;

  /** Requires an instance with a PAT with the 'write:org' permission enabled */
  constructor(
    private readonly gql: typeof graphql,
    private readonly repoData: Repository,
    private readonly projectNumber: number,
    private readonly logger: ILogger,
    private readonly projectFields?: ProjectFields,
  ) {}

  async changeIssueStateInProject(issueCardId: string, projectNodeId: string, fields: ProjectFields): Promise<void> {
    try {
      const op = await this.gql(UPDATE_PROJECT_V2_ITEM_FIELD_VALUE_QUERY, {
        project: projectNodeId,
        item: issueCardId,
        targetField: fields.field,
        targetFieldValue: fields.value,
      });

      this.logger.debug("Returned " + JSON.stringify(op));
    } catch (e) {
      this.logger.error("Failed while executing the 'UPDATE_PROJECT_V2_ITEM_FIELD_VALUE_QUERY' query");
      throw e;
    }
  }

  /**
   * Get all the project fields in a project, with their node ids and available options
   * @returns A collection of all the fields available in the issue item
   */
  async getProjectFields(projectId: string): Promise<FieldData[]> {
    try {
      type returnType = { node: { fields: { nodes: FieldData[] } } };
      const projectData = await this.gql<returnType>(PROJECT_FIELD_ID_QUERY, { project: projectId });

      this.logger.debug("correct node data: " + JSON.stringify(projectData.node.fields.nodes[0]));
      return projectData.node.fields.nodes;
    } catch (e) {
      this.logger.error("Failed while executing the 'PROJECT_V2_QUERY' query");
      throw e;
    }
  }

  /**
   * Fetches the node id from the project id and caches it.
   * @returns node_id of the project. This value never changes so caching it per instance is effective
   */
  async fetchProjectData(): Promise<NodeData> {
    if (this.projectNode) {
      return this.projectNode;
    }

    try {
      // Source: https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects#using-variables
      const projectData = await this.gql<{ organization: { projectV2: NodeData } }>(PROJECT_V2_QUERY, {
        organization: this.repoData.owner,
        number: this.projectNumber,
      });

      this.projectNode = projectData.organization.projectV2;

      return projectData.organization.projectV2;
    } catch (e) {
      this.logger.error("Failed while executing the 'PROJECT_V2_QUERY' query");
      throw e;
    }
  }

  async updateProjectNextItemField(
    project: string,
    item: string,
    targetField: string,
    targetFieldValue: string,
  ): Promise<void> {
    await this.gql(UPDATE_PROJECT_V2_ITEM_FIELD_VALUE_QUERY, { project, item, targetField, targetFieldValue });
  }

  async assignIssueToProject(issue: Issue, projectId: string): Promise<string> {
    try {
      const migration = await this.gql<{ addProjectV2ItemById: { item: { id: string } } }>(
        ADD_PROJECT_V2_ITEM_BY_ID_QUERY,
        { project: projectId, issue: issue.node_id },
      );

      return migration.addProjectV2ItemById.item.id;
    } catch (e) {
      this.logger.error("Failed while executing 'ADD_PROJECT_V2_ITEM_BY_ID_QUERY' query");
      throw e;
    }
  }

  async addIssueToProject(issue: Issue, project: NodeData): Promise<boolean> {
    this.logger.info(`Syncing issue #${issue.number} for ${project.title}`);

    const issueCardId = await this.assignIssueToProject(issue, project.id);

    if (this.projectFields) {
      const { field, value } = this.projectFields;
      const projectFields = await this.getProjectFields(project.id);
      const fieldValues = projectFields.find((pf) => pf.name === this.projectFields?.field);
      if (!fieldValues) {
        throw new Error(`Field ${field} does not exist!`);
      } else if (!fieldValues.options) {
        throw new Error(`Field ${field} does not have any available options!.` + "Please add options to set values");
      }

      const index = fieldValues.options.findIndex((fv) => fv.name === value);
      if (index < 0) {
        const valuesArray = fieldValues.options.map((options) => options.name);
        throw new Error(`Project value does not exist. Available values are ${JSON.stringify(valuesArray)}`);
      }

      await this.changeIssueStateInProject(issueCardId, project.id, {
        field: fieldValues.id,
        value: fieldValues.options[index].id,
      });
      return true;
    }

    return !!issueCardId;
  }

  async assignIssue(issue: Issue): Promise<boolean> {
    const project = await this.fetchProjectData();

    return await this.addIssueToProject(issue, project);

    // TODO: Assign targetField
  }

  async assignIssues(issues: Issue[]): Promise<boolean[]> {
    const project = await this.fetchProjectData();

    const issueAssigment = issues.map((issue) => this.addIssueToProject(issue, project));

    return await Promise.all(issueAssigment);
  }
}
