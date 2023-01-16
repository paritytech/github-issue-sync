export type Repository = { owner: string, repo: string };

export type Issue = { number: number; node_id:string };

export interface IProjectApi {
    /**
     * Assign an issue to a project
     * @param issueNodeId The issue node_id (which differs from the issue id)
     * @param projectId The project id (found in github.com/repo/projects/<ID>)
     */
    assignIssue(issue: Issue): Promise<boolean>;
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
    getAllIssuesId(excludeClosed: boolean): Promise<Issue[]>;
}
