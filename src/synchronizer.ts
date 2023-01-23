import { FieldValues, IIssues, ILogger, IProjectApi, Issue, NodeData } from "./github/types";

// type IssueEvent = "opened" | "deleted" | "closed" | "reopened" | "labeled" | "unlabeled" | "transfered";

type EventNames = "workflow_dispatch" | "issues" | string;

export type GitHubContext = {
  eventName: EventNames;
  payload: {
    inputs?: { excludeClosed?: "true" | "false" };
    issue?: Issue;
  };
  config?: {
    projectField?: FieldValues;
  };
};

export class Synchronizer {
  constructor(
    private readonly issueKit: IIssues,
    private readonly projectKit: IProjectApi,
    private readonly logger: ILogger,
  ) {}

  async synchronizeIssue(context: GitHubContext): Promise<void> | never {
    if (context.eventName === "workflow_dispatch") {
      const excludeClosed = context.payload.inputs?.excludeClosed === "true";
      this.logger.notice(excludeClosed ? "Closed issues will NOT be synced." : "Closed issues will be synced.");
      return await this.updateAllIssues(excludeClosed, context.config?.projectField);
    } else if (context.eventName === "issues") {
      const { issue } = context.payload;
      if (!issue) {
        throw new Error("Issue payload object was null");
      }
      this.logger.debug(`Received issue ${JSON.stringify(issue)}`);
      this.logger.info(`Assigning issue #${issue.number} to project`);
      return await this.updateOneIssue(issue, context.config?.projectField);
    } else {
      const failMessage = `Event '${context.eventName}' is not expected. Failing.`;
      this.logger.warning(failMessage);
      throw new Error(failMessage);
    }
  }

  /**
   * Gets the field node data ids to set custom fields
   * This method will fail if the field or value are not available.
   * @param project Project node data. Should be obtained from project kit
   * @param customField key value pair with the names of the fields. Not case sensitive
   * @returns Returns a key value pair with the node id of both the field and the value or null if the application threw an error
   */
  private async getCustomFieldNodeData(project: NodeData, customField?: FieldValues): Promise<FieldValues | null> {
    if (!customField) {
      return null;
    }

    try {
      return await this.projectKit.fetchProjectFieldNodeValues(project, customField);
    } catch (e) {
      throw new Error("Failed fetching project values", { cause: e });
    }
  }

  private async updateAllIssues(excludeClosed: boolean = false, customField?: FieldValues): Promise<void> | never {
    const issues = await this.issueKit.getAllIssues(excludeClosed);
    if (issues?.length === 0) {
      return this.logger.notice("No issues found");
    }
    this.logger.info(`Updating ${issues.length} issues`);

    const projectNode = await this.projectKit.fetchProjectData();
    const customFieldNodeData = await this.getCustomFieldNodeData(projectNode, customField);
    const issuesAssigmentPromises = issues.map((issue) => this.projectKit.assignIssue(issue, projectNode));
    const issuesCardIds = await Promise.all(issuesAssigmentPromises);
    this.logger.debug(`Finished assigning ${issuesCardIds.length} issues`);
    if (customFieldNodeData) {
      this.logger.debug("Found custom field node data for " + JSON.stringify(customField));
      const assignCustomFieldPromise = issuesCardIds.map((ici) =>
        this.projectKit.changeIssueStateInProject(ici, projectNode, customFieldNodeData),
      );
      await Promise.all(assignCustomFieldPromise);
    }
  }

  private async updateOneIssue(issue: Issue, customField?: FieldValues): Promise<void> | never {
    const projectNode = await this.projectKit.fetchProjectData();
    const customFieldNodeData = await this.getCustomFieldNodeData(projectNode, customField);
    const issueCardId = await this.projectKit.assignIssue(issue, projectNode);
    if (customFieldNodeData) {
      await this.projectKit.changeIssueStateInProject(issueCardId, projectNode, customFieldNodeData);
    }
  }
}
