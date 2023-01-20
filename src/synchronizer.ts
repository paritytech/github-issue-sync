import { FieldValues, IIssues, ILogger, IProjectApi, Issue, NodeData } from "./github/types";

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
    private readonly customField?: FieldValues,
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

  /**
   * Gets the field node data ids to set custom fields
   * This method can fail when it doesn't find the correct information so, instead of throwing, we log the error
   * @param project Project node data. Should be obtained from project kit
   * @param customField key value pair with the names of the fields. Not case sensitive
   * @returns Returns a key value pair with the node id of both the field and the value or null if the application threw an error
   */
  private async getCustomFieldNodeData(project: NodeData, customField: FieldValues): Promise<FieldValues | null> {
    try {
      return await this.projectKit.fetchProjectFieldNodeValues(project, customField);
    } catch (e) {
      this.logger.notice("Failed fetching project values. Skipping project field assignment.");
      this.logger.warning(e as Error);
      return null;
    }
  }

  private async updateAllIssues(excludeClosed: boolean = false): Promise<boolean> {
    const issues = await this.issueKit.getAllIssues(excludeClosed);
    if (issues?.length === 0) {
      this.logger.notice("No issues found");
      return false;
    }
    this.logger.info(`Updating ${issues.length} issues`);

    const projectNode = await this.projectKit.fetchProjectData();
    const issuesAssigmentPromises = issues.map((issue) => this.projectKit.assignIssue(issue, projectNode));
    const issuesCardIds = await Promise.all(issuesAssigmentPromises);
    this.logger.debug(`Finished assigning ${issuesCardIds.length} issues`);
    if (this.customField) {
      const customFieldNodeData = await this.getCustomFieldNodeData(projectNode, this.customField);
      if (customFieldNodeData) {
        this.logger.debug("Found custom field node data for " + JSON.stringify(this.customField));
        const assignCustomFieldPromise = issuesCardIds.map((ici) =>
          this.projectKit.changeIssueStateInProject(ici, projectNode, customFieldNodeData),
        );
        await Promise.all(assignCustomFieldPromise);
        return true;
      }
      // something failed while fetching the custom field node data
      return false;
    }

    return true;
  }

  private async updateOneIssue(issue: Issue): Promise<boolean> {
    const projectNode = await this.projectKit.fetchProjectData();
    const issueCardId = await this.projectKit.assignIssue(issue, projectNode);
    if (this.customField) {
      const customFieldNodeData = await this.getCustomFieldNodeData(projectNode, this.customField);
      if (customFieldNodeData) {
        await this.projectKit.changeIssueStateInProject(issueCardId, projectNode, customFieldNodeData);
      } else {
        // something failed while fetching the custom field node data
        return false;
      }
    }

    return true;
  }
}
