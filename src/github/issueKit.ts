import { GitHub } from "@actions/github/lib/utils";

import { IIssues, Issue, Repository } from "./types";

export class IssueApi implements IIssues {
  /** Requires permissions to the repository with access to the repo */
  constructor(
    private readonly octokit: InstanceType<typeof GitHub>,
    private readonly repoData: Repository,
  ) {}

  async getIssueState(issueId: number): Promise<"open" | "closed"> {
    const { owner, repo } = this.repoData;
    const issueData = await this.octokit.rest.issues.get({
      repo,
      owner,
      issue_number: issueId,
    });
    return issueData.data.state === "open" ? "open" : "closed";
  }

  async getAllIssues(
    excludeClosed: boolean,
    labels?: string[],
  ): Promise<Issue[]> {
    const allIssues = await this.octokit.rest.issues.listForRepo({
      ...this.repoData,
      state: excludeClosed ? "open" : "all",
      labels: labels?.join(","),
    });
    return allIssues.data;
  }
}
