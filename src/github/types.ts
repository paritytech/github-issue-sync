export type Repository = { owner: string; repo: string };

export type Issue = {
  number: number;
  node_id?: string;
  labels?: (string | { name?: string })[];
};

/** Key value pair with the name/id of a field and the name/id of its value */
export type FieldValues = { field: string; value: string };

export type NodeData = { id: string; title: string };

export interface IProjectApi {
  /**
   * Fetches the node id from the project id and caches it.
   * @returns node_id of the project. This value never changes so caching it per instance is effective
   */
  fetchProjectData(): Promise<NodeData>;
  /**
   * Assign an issue to a project
   * @param issue The issue object which has the number and the node_id
   * @returns the issueCardId of the created issue. This ID is used in changeIssueStateInProject.
   * @see changeIssueStateInProject
   */
  assignIssue(issue: Issue, project: NodeData): Promise<string>;
  /**
   * Fetches the available fields for a project board and filters to find the node ids of the field and value
   * If either the field or the value don't exist, it will fail with an exception
   * @param project The node data of the project
   * @param projectFields The literal names of the fields to be modified
   * @returns The id of both the field and the value
   */
  fetchProjectFieldNodeValues(
    project: NodeData,
    projectFields?: FieldValues,
  ): Promise<FieldValues>;
  // getProjectIdFromIssue(issueId: number): Promise<number>;
  changeIssueStateInProject(
    issueCardId: string,
    project: NodeData,
    fields: FieldValues,
  ): Promise<void>;
}

/** Class managing the instance of issues */
export interface IIssues {
  /**
   * Returns the state of an issue (open or closed)
   * @param issueId
   */
  getIssueState(issueNumber: number): Promise<"open" | "closed">;
  /**
   * Returns the node_id for all the issues available in the repository
   * @param includeClosed exclude issues which are closed from the data agregation.
   */
  getAllIssues(excludeClosed: boolean, labels?: string[]): Promise<Issue[]>;
}

export interface ILogger {
  info(message: string): void;
  warning(message: string | Error): void;
  error(message: string | Error): void;
  /** Only posts messages if the action is ran in debug mode */
  debug(message: string): void;
  /** Publishes a message that can be seen in the action preview */
  notice(message: string): void;
}
