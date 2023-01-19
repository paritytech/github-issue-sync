export type Repository = { owner: string; repo: string };

export type Issue = { number: number; node_id: string };

export interface IProjectApi {
  /**
   * Assign an issue to a project
   * @param issue The issue object which has the number and the node_id
   */
  assignIssue(issue: Issue): Promise<boolean>;

  /**
   * Assign several issues to a project
   * @param issues The issue object collection which has the number and the node_id
   */
  assignIssues(issues: Issue[]): Promise<boolean[]>;
  // getProjectIdFromIssue(issueId: number): Promise<number>;
  // changeIssueStateInProject(issueId: number, state: "todo" | "in progress" | "blocked" | "done"): Promise<boolean>;
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
  getAllIssues(excludeClosed: boolean): Promise<Issue[]>;
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
