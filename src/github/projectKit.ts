import { graphql } from "@octokit/graphql";

import { ILogger, IProjectApi, Issue, Repository } from "./types";

type NodeData = { id: string; title: string };

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

interface CreatedProjectItemForIssue {
  addProjectNextItem: { projectNextItem: { id: string } };
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
  ) { }

  /*   changeIssueStateInProject(issueCardId: number, state: "todo" | "in progress" | "blocked" | "done"): Promise<void> {
      return this.gql(
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
        { project: this.projectNumber, item: issueCardId, targetField: "Status", targetFieldValue: state },
      );
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
      const projectData = await this.gql<ProjectData>(
        `
      query($organization: String!, $number: Int!) {
        organization(login: $organization){
          projectV2(number: $number) {
            id
            title
          }
        }
      }
    `,
        { organization: this.repoData.owner, number: this.projectNumber },
      );

      this.logger.info("data received " + JSON.stringify(projectData));

      this.projectNode = projectData.organization.projectV2;

      return projectData.organization.projectV2;
    } catch (e) {
      this.logger.error("Failed while executing the FetchProjectId query");
      throw e;
    }
  }

  // step three
  async updateProjectNextItemField(
    project: string,
    item: string,
    targetField: string,
    targetFieldValue: string,
  ): Promise<void> {
    await this.gql(
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
  }

  async assignIssueToProject(issue: Issue, projectId: string): Promise<boolean> {
    try {
      const migration = await this.gql<CreatedProjectItemForIssue>(
        `
          mutation($project: ID!, $issue: ID!) {
            addProjectNextItem(input: {projectId: $project, contentId: $issue}) {
              projectNextItem {
                id
              }
            }
          }
        `,
        { project: projectId, issue: issue.node_id },
      );

      // TODO: Check what is this ID
      return !!migration.addProjectNextItem.projectNextItem.id;
    } catch (e) {
      this.logger.error("Failed while executing 'addProjectNextItem' query");
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
