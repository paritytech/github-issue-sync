import { GitHub } from "@actions/github/lib/utils";
import { Octokit } from "@octokit/rest";
import { IIssues, IssueNode, Repository } from "./types";



export class IssueApi implements IIssues {
    /** Requires permissions to the repository with access to the repo */
    constructor(private readonly octokit: InstanceType<typeof GitHub>, private readonly repoData: Repository) {
    }

    async getIssueState(issueId: number): Promise<"open" | "closed"> {
        const { owner, repo } = this.repoData;
        const issueData = await this.octokit.rest.issues.get({ repo, owner, issue_number: issueId });
        return issueData.data.state === "open" ? "open" : "closed";
    }

    async getAllIssuesId(excludeClosed: boolean): Promise<IssueNode[]> {
        const allIssues = await this.octokit.rest.issues.listForRepo(this.repoData);
        if (excludeClosed) {
            return allIssues.data.filter(i => i.state === "open").map(i => ({ id: i.node_id }));
        }
        return allIssues.data.map(issue => ({ id: issue.node_id }));
    }
}
