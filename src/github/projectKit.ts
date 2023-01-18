import { graphql } from "@octokit/graphql";

import { ILogger, IProjectApi, Issue, Repository } from "./types";

type NodeData = { id: string; title: string };

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

interface ProjectData {
  organization: {
    projectV2: NodeData;
    // {
    //   id: string;
    //   title: string;
    //   // fields: {
    //   //   nodes: {
    //   //     id: string;
    //   //     name: string;
    //   //     settings?: string | null;
    //   //   }[];
    //   // };
    // };
  };
}

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
  ) {}

  /* 
  changeIssueStateInProject(issueCardId: number, state: "todo" | "in progress" | "blocked" | "done"): Promise<void> {
    return this.gql(UPDATE_STATE_IN_PROJECT_QUERY, {
      project: this.projectNumber,
      item: issueCardId,
      targetField: "Status",
      targetFieldValue: state,
    });
  } */

  /**
   * Fetches the node id from the project id and caches it.
   * @returns node_id of the project. This value never changes so caching it per instance is effective
   */
  async fetchProjectData(): Promise<NodeData> {
    if (this.projectNode) {
      return this.projectNode;
    }

    try {
      // Source: https://docs.github.com/en/graphql/reference/objects#projectnext
      const projectData = await this.gql<ProjectData>(PROJECT_V2_QUERY, {
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

  async assignIssueToProject(issue: Issue, projectId: string): Promise<boolean> {
    try {
      const migration = await this.gql<{ addProjectV2ItemById: { item: { id: string } } }>(
        ADD_PROJECT_V2_ITEM_BY_ID_QUERY,
        { project: projectId, issue: issue.node_id },
      );

      return !!migration.addProjectV2ItemById.item.id;
    } catch (e) {
      this.logger.error("Failed while executing 'ADD_PROJECT_V2_ITEM_BY_ID_QUERY' query");
      throw e;
    }
  }

  async addIssueToProject(issue: Issue, project: NodeData): Promise<boolean> {
    this.logger.info(`Syncing issue #${issue.number} for ${project.title}`);

    return await this.assignIssueToProject(issue, project.id);
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
