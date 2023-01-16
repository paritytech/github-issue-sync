import { IIssues, IProjectApi, Issue } from "./github/types"


export type IssueEvent = "opened" | "deleted" | "closed" | "reopened" | "labeled" | "unlabeled" | "transfered"

export class Synchronizer {
    constructor(private readonly issueKit: IIssues, private readonly projectKit: IProjectApi) {

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
