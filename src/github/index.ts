import { Octokit } from "@octokit/rest";

interface IGitHub {
	assignProjectToIssue(issueId: number, projectId: number): Promise<boolean>;
	getIssueState(issueId: number): Promise<"open" | "closed">;
	getAllIssuesId(): Promise<string[]>;
	getProjectIdFromIssue(issueId: number): Promise<number>;
	changeIssueStateInProject(issueId: number, state: "todo" | "in progress" | "blocked" | "done"): Promise<boolean>;
}

export class OctokitInstance implements IGitHub {
    private readonly repoData: {owner: string, repo:string};
    constructor(private readonly octokit:Octokit){
this.repoData = {owner: "me", repo: "name"};
    }

    async assignProjectToIssue(issueId: number, projectId: number): Promise<boolean>{
        const issue = await this.octokit.rest.issues.get({owner:"owner", repo: "repo", issue_number: 3});
        throw new Error("Method not implemented.");
    }
    getIssueState(issueId: unknown): Promise<"open" | "closed"> {
        throw new Error("Method not implemented.");
    }
    async getAllIssuesId(): Promise<string[]> {
        const allIssues = await this.octokit.rest.issues.listForRepo(this.repoData);
        return allIssues.data.map(issues => issues.node_id);
        throw new Error("Method not implemented.");
    }
    getProjectIdFromIssue(issueId: unknown): Promise<number> {
        throw new Error("Method not implemented.");
    }

    changeIssueStateInProject(issueId: number, state: "todo" | "in progress" | "blocked" | "done"): Promise<boolean>{
        throw new Error("Method not implemented.");
    }

}
