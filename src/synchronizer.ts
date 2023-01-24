import { FieldValues, IIssues, ILogger, IProjectApi, Issue, NodeData } from "./github/types";

export type IssueEvent = "opened" | "deleted" | "closed" | "reopened" | "labeled" | "unlabeled" | "transfered";

type EventNames = "workflow_dispatch" | "issues" | string;

type Payload = {
  action?: IssueEvent | string;
  inputs?: { excludeClosed?: "true" | "false" };
  issue?: Issue;
  label?: {
    description: string;
    id: number;
    name: string;
  };
};

export type GitHubContext = {
  eventName: EventNames;
  payload: Payload;
  config?: {
    projectField?: FieldValues;
    labels?: string[];
  };
};

const toLowerCase = (array: string[]): string[] => array.map((a) => a.toLowerCase());

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
      this.logger.debug(`Required labels are: '${JSON.stringify(context.config?.labels)}'`);
      this.logger.debug("Payload received:", context.payload);
      const { issue } = context.payload;
      if (!issue) {
        throw new Error("Issue payload object was null");
      }
      this.logger.debug(`Received event: ${context.eventName}`);
      if (this.shouldAssignIssue(context.payload, context.config?.labels)) {
        this.logger.info(`Assigning issue #${issue.number} to project`);
        return await this.updateOneIssue(issue, context.config?.projectField);
      } else {
        return this.logger.info("Skipped assigment as it didn't fullfill requirements.");
      }
    } else {
      const failMessage = `Event '${context.eventName}' is not expected. Failing.`;
      this.logger.warning(failMessage);
      throw new Error(failMessage);
    }
  }

  /**
   * Labels can be either an array of objects or an array of string (or maybe both?)
   * This functions cleans them and returns all the labels names as a string array
   */
  private convertLabelArray(labels?: (string | { name?: string })[]): string[] {
    if (!labels || labels.length === 0) {
      return [];
    }
    const list: string[] = [];

    labels.forEach((label) => {
      if (typeof label === "string" || label instanceof String) {
        list.push(label as string);
      } else if (label.name) {
        list.push(label.name);
      }
    });

    return list;
  }

  /**
   * Method which takes all of the (predicted) cases and calculates if the issue should be assigned of skipped
   * @param payload object which contains both the event, the issue type and it's information
   * @param labels labels required for the action. Can be null or empty
   * @returns true if the label should be assigned, false if it should be skipped
   */
  private shouldAssignIssue(payload: Payload, labels?: string[]): boolean {
    const action = payload.action as IssueEvent;

    if (action === "labeled") {
      // If this is a labeling event but there are no labels in the config we skip them
      if (!labels || labels.length === 0) {
        this.logger.notice("No required labels found. Skipping assignment.");
        return false;
      }

      const labelName = payload.label?.name;
      // Shouldn't happen. Throw and find out what is this kind of event.
      if (!labelName) {
        throw new Error("No label found in a labeling event!");
      }

      if (toLowerCase(labels).indexOf(labelName.toLowerCase()) > -1) {
        this.logger.info(`Found matching label '${labelName}'`);
        return true;
      } else {
        this.logger.notice(
          `Label '${labelName}' does not match any of the labels '${JSON.stringify(labels)}'. Skipping.`,
        );
        return false;
      }
    } else if (action === "unlabeled") {
      this.logger.warning("No support for 'unlabeled' event yet. Skipping");
      return false;
    } else {
      // if no labels are required and this is not a labeling event, assign the issue.
      if (!labels || labels.length === 0) {
        this.logger.info("Matching requirements: not a labeling event and no labels found in the configuration.");
        return true;
      }
      // if the issue in this event has labels and a matching label config, assign it.
      const issueLabels = payload.issue?.labels ?? null;
      if (labels.length > 0 && issueLabels && issueLabels.length > 0) {
        // complex query. Sanitizing everything to a lower case string array first
        const parsedLabels = toLowerCase(this.convertLabelArray(issueLabels));
        const requiredLabels = toLowerCase(labels);
        // checking if an element in one array is included in the second one
        const matchingElement = parsedLabels.some((pl) => requiredLabels.includes(pl));
        if (matchingElement) {
          this.logger.info(
            `Found matching element between ${JSON.stringify(parsedLabels)} and ${JSON.stringify(labels)}`,
          );
          return true;
        }
        return false;
      }
    }

    this.logger.debug(`Case ${action} not considered. Accepted with the following payload: `, payload);
    return true;
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
