import { IIssues, ILogger, IProjectApi, Issue } from "./github/types";


type IssueEvent = "opened" | "deleted" | "closed" | "reopened" | "labeled" | "unlabeled" | "transfered";

type EventNames = "workflow_dispatch" | "issues" | string;


export type GitHubContext = {
    eventName: EventNames, payload: {
        inputs?: { excludeClosed?: "true" | "false" },
        issue?: Issue
    }
}

export class Synchronizer {
    constructor(
        private readonly issueKit: IIssues,
        private readonly projectKit: IProjectApi,
        private readonly logger: ILogger) {
    }

    async synchronizeIssue(context: GitHubContext): Promise<void> {
        switch (context.eventName) {
            case "workflow_dispatch":
                const excludeClosed = context.payload.inputs?.excludeClosed === "true";
                this.logger.notice(excludeClosed ? "Closed issues will NOT be synced." : "Closed issues will be synced.");
                return this.updateAllIssues(excludeClosed);
            case "issues":
                const { issue } = context.payload;
                if (!issue) {
                    throw new Error("Issue payload object was null");
                }
                this.logger.debug(`Received issue ${JSON.stringify(issue)}`);
                this.logger.info(`Assigning issue #${issue.number} to project`);
                return this.updateOneIssue(issue);
            default:
                const failMessage = `Event '${context.eventName}' is not expected. Failing.`;
                this.logger.warning(failMessage)
                throw new Error(failMessage);
        }
    }

    async updateAllIssues(excludeClosed: boolean = false) {
        const issuesIds = await this.issueKit.getAllIssuesId(excludeClosed);
        const updatePromises = issuesIds.map(nodeId => this.projectKit.assignIssue(nodeId));
        await Promise.all(updatePromises);
    }

    async updateOneIssue(issue: Issue) {
        this.projectKit.assignIssue(issue);
    }
}
