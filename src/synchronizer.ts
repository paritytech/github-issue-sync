import { IIssues, ILogger, IProjectApi, Issue } from "./github/types";

// type IssueEvent = "opened" | "deleted" | "closed" | "reopened" | "labeled" | "unlabeled" | "transfered";

type EventNames = "workflow_dispatch" | "issues" | string;

export type GitHubContext = {
  eventName: EventNames;
  payload: {
    inputs?: { excludeClosed?: "true" | "false" };
    issue?: Issue;
  };
};

export class Synchronizer {
  constructor(
    private readonly issueKit: IIssues,
    private readonly projectKit: IProjectApi,
    private readonly logger: ILogger,
  ) {}

  async synchronizeIssue(context: GitHubContext): Promise<boolean> {
    if (context.eventName === "workflow_dispatch") {
      const excludeClosed = context.payload.inputs?.excludeClosed === "true";
      this.logger.notice(excludeClosed ? "Closed issues will NOT be synced." : "Closed issues will be synced.");
      return await this.updateAllIssues(excludeClosed);
    } else if (context.eventName === "issues") {
      const { issue } = context.payload;
      if (!issue) {
        throw new Error("Issue payload object was null");
      }
      this.logger.debug(`Received issue ${JSON.stringify(issue)}`);
      this.logger.info(`Assigning issue #${issue.number} to project`);
      return await this.updateOneIssue(issue);
    } else {
      const failMessage = `Event '${context.eventName}' is not expected. Failing.`;
      this.logger.warning(failMessage);
      throw new Error(failMessage);
    }
  }

  async updateAllIssues(excludeClosed: boolean = false): Promise<boolean> {
    const issuesIds = await this.issueKit.getAllIssuesId(excludeClosed);
    const updatePromises = issuesIds.map((nodeId) => this.projectKit.assignIssue(nodeId));
    const syncs = await Promise.all(updatePromises);
    return syncs.every((s) => s);
  }

  async updateOneIssue(issue: Issue): Promise<boolean> {
    return await this.projectKit.assignIssue(issue);
  }
}
