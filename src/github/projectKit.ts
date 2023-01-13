import { graphql } from "@octokit/graphql";
import { IProjectApi, IssueNode, Repository } from "./types";

interface ProjectData {
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

interface CreatedProjectItemForIssue {
  addProjectNextItem: { projectNextItem: { id: string } };
};


/**
 * Instance that manages the GitHub's project api
 * ? Octokit.js doesn't support Project v2 API yet so we need to use graphQL
 * Used this blog post as a reference for the queries: https://www.cloudwithchris.com/blog/automate-adding-gh-issues-projects-beta/
 */
export class ProjectKit implements IProjectApi {

  private projectNodeId: string | null = null;
  public get projectNextId(): string | null {
    return this.projectNodeId;
  }

  /** Requires an instance with a PAT with the 'write:org' permission enabled */
  constructor(private readonly gql: typeof graphql, private readonly repoData: Repository, private readonly projectNumber: number) {
  }

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
  async fetchProjectId(): Promise<string> {
    if (this.projectNextId) {
      return this.projectNextId;
    }

    const projectData = await this.gql<ProjectData>(
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
      { organization: this.repoData.owner, number: this.projectNumber },
    );

    this.projectNodeId = projectData.organization.projectNext.id;

    return projectData.organization.projectNext.id;
  }

  // step three
  updateProjectNextItemField(
    project: string,
    item: string,
    targetField: string,
    targetFieldValue: string,
  ) {
    this.gql(
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

  // step one
  async assignIssue(issueNodeId: IssueNode): Promise<boolean> {
    const project = await this.fetchProjectId();

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
      { project, issue: issueNodeId.id },
    );

    // TODO: Check what is this ID
    return !!migration.addProjectNextItem.projectNextItem.id;
  }

  async assignIssueToProject(issueNodeId: string) {
    const projectNodeForIssue = await this.assignIssue({id: issueNodeId});

    // TODO: Assign targetField
  }
}
