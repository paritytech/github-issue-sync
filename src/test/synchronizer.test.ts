/* eslint-disable @typescript-eslint/unbound-method */
import { mock, mockReset } from "jest-mock-extended";

import { IIssues, ILogger, IProjectApi, Issue, NodeData } from "src/github/types";
import { GitHubContext, Synchronizer } from "src/synchronizer";

describe("Synchronizer tests", () => {
  const issueKit = mock<IIssues>();
  const projectKit = mock<IProjectApi>();
  const logger = mock<ILogger>();
  let synchronizer: Synchronizer;

  beforeEach(() => {
    mockReset(issueKit);
    mockReset(projectKit);
    mockReset(logger);
    synchronizer = new Synchronizer(issueKit, projectKit, logger);
  });

  describe("synchronize Issues function", () => {
    test("should fail on invalid event name", async () => {
      const randomEventName = new Date().toDateString();
      const expectedError = `Event '${randomEventName}' is not expected. Failing.`;
      await expect(synchronizer.synchronizeIssue({ eventName: randomEventName, payload: {} })).rejects.toThrow(
        expectedError,
      );
    });

    test("should fail on issue event without payload", async () => {
      await expect(synchronizer.synchronizeIssue({ eventName: "issues", payload: {} })).rejects.toThrow(
        "Issue payload object was null",
      );
    });

    test("should log when all issues will be synced", async () => {
      issueKit.getAllIssues.mockResolvedValue([]);
      await synchronizer.synchronizeIssue({ eventName: "workflow_dispatch", payload: {} });

      expect(logger.notice).toBeCalledWith("Closed issues will be synced.");
    });

    test("should log when only open issues will be synced", async () => {
      issueKit.getAllIssues.mockResolvedValue([]);
      await synchronizer.synchronizeIssue({
        eventName: "workflow_dispatch",
        payload: { inputs: { excludeClosed: "true" } },
      });

      expect(logger.notice).toBeCalledWith("Closed issues will NOT be synced.");
    });
  });

  describe("update one issue", () => {
    let nodeData: NodeData;
    let ctx: GitHubContext;
    let issueNumber: number;
    beforeEach(() => {
      issueNumber = Math.floor(Math.random() * 100);
      nodeData = { id: new Date().toDateString(), title: "Update one issue" };
      ctx = { eventName: "issues", payload: { issue: { node_id: "update_one_issue", number: issueNumber } } };
      projectKit.fetchProjectData.mockResolvedValue(nodeData);
    });

    test("should invoke using the correct node data", async () => {
      await synchronizer.synchronizeIssue(ctx);
      expect(logger.info).toBeCalledWith(`Assigning issue #${issueNumber} to project`);
      expect(projectKit.assignIssue).toBeCalledWith(ctx.payload.issue, nodeData);
    });

    test("should return true on correct execution", async () => {
      expect(await synchronizer.synchronizeIssue(ctx)).toBeTruthy();
      expect(logger.info).toBeCalledWith(`Assigning issue #${issueNumber} to project`);
    });

    test("should fetch custom fields data", async () => {
      const [field, value] = ["a", "B"];
      synchronizer = new Synchronizer(issueKit, projectKit, logger, { field, value });
      await synchronizer.synchronizeIssue(ctx);
      expect(projectKit.fetchProjectFieldNodeValues).toBeCalledWith(nodeData, { field, value });
    });

    test("should assign custom fields", async () => {
      synchronizer = new Synchronizer(issueKit, projectKit, logger, { field: "c", value: "d" });
      const nodeValueData = { field: "eee", value: "fff" };
      projectKit.fetchProjectFieldNodeValues.mockResolvedValue(nodeValueData);
      const issueCardNodeId = "issue_node_id_example";
      projectKit.assignIssue.mockResolvedValue(issueCardNodeId);
      expect(await synchronizer.synchronizeIssue(ctx)).toBeTruthy();
      expect(projectKit.changeIssueStateInProject).toBeCalledWith(issueCardNodeId, nodeData, nodeValueData);
    });

    test("should return false on error while assigning custom field", async () => {
      synchronizer = new Synchronizer(issueKit, projectKit, logger, { field: "c", value: "d" });
      projectKit.fetchProjectFieldNodeValues.mockRejectedValue(new Error());
      expect(await synchronizer.synchronizeIssue(ctx)).toBeFalsy();
      expect(logger.notice).toBeCalledWith("Failed fetching project values. Skipping project field assignment.");
      expect(projectKit.changeIssueStateInProject).toHaveBeenCalledTimes(0);
    });
  });
  describe("update all issues", () => {
    let nodeData: NodeData;
    let ctx: GitHubContext;
    beforeEach(() => {
      nodeData = { id: new Date().toDateString(), title: "Update all issues" };
      ctx = { eventName: "workflow_dispatch", payload: {} };
      projectKit.fetchProjectData.mockResolvedValue(nodeData);
    });

    test("should report when no issues are available", async () => {
      issueKit.getAllIssues.mockResolvedValue([]);
      expect(await synchronizer.synchronizeIssue(ctx)).toBeFalsy();
      expect(logger.notice).toBeCalledWith("No issues found");
    });

    test("should return true in correct execution", async () => {
      const issues: Issue[] = [{ number: 1, node_id: "asd_dsa" }];

      issueKit.getAllIssues.mockResolvedValue(issues);
      expect(await synchronizer.synchronizeIssue(ctx)).toBeTruthy();
    });

    test("should call assign Issues with an iteration", async () => {
      const issues: Issue[] = [
        { number: 1, node_id: "asd_dsa" },
        { number: 2, node_id: "poi_lkj" },
        { number: 3, node_id: "grs_Dfr" },
        { number: 4, node_id: "hor_2dg" },
      ];

      issueKit.getAllIssues.mockResolvedValue(issues);
      expect(await synchronizer.synchronizeIssue(ctx)).toBeTruthy();

      for (let i = 0; i < issues.length; i++) {
        expect(projectKit.assignIssue).toHaveBeenNthCalledWith(i + 1, issues[i], nodeData);
      }
      expect(logger.debug).toBeCalledWith(`Finished assigning ${issues.length} issues`);
    });

    test("should fetch custom fields data", async () => {
      const [field, value] = ["a", "B"];
      issueKit.getAllIssues.mockResolvedValue([{ number: 999, node_id: "123_asd" }]);
      synchronizer = new Synchronizer(issueKit, projectKit, logger, { field, value });
      await synchronizer.synchronizeIssue(ctx);
      expect(projectKit.fetchProjectFieldNodeValues).toBeCalledWith(nodeData, { field, value });
    });

    test("should assign custom fields", async () => {
      const issues: Issue[] = [
        { number: 1, node_id: "asdw_dsa" },
        { number: 2, node_id: "gers_Dfr" },
        { number: 4, node_id: "hgor_2dg" },
        { number: 8, node_id: "pdoi_lkj" },
      ];
      const nodeValueData = { field: "eee", value: "fff" };
      issueKit.getAllIssues.mockResolvedValue(issues);
      synchronizer = new Synchronizer(issueKit, projectKit, logger, { field: "ooo", value: "iiii" });
      projectKit.fetchProjectFieldNodeValues.mockResolvedValue(nodeValueData);

      let index = 1;
      projectKit.assignIssue
        .mockResolvedValueOnce(`_${index++}`)
        .mockResolvedValueOnce(`_${index++}`)
        .mockResolvedValueOnce(`_${index++}`)
        .mockResolvedValueOnce(`_${index++}`);

      await synchronizer.synchronizeIssue(ctx);
      for (let i = 1; i < issues.length; i++) {
        expect(projectKit.changeIssueStateInProject).toHaveBeenNthCalledWith(i, `_${i}`, nodeData, nodeValueData);
      }
    });

    test("should return false on error while assigning custom field", async () => {
      issueKit.getAllIssues.mockResolvedValue([{ number: 999, node_id: "123_asd" }]);
      synchronizer = new Synchronizer(issueKit, projectKit, logger, { field: "k", value: "y" });
      projectKit.fetchProjectFieldNodeValues.mockRejectedValue(new Error());
      expect(await synchronizer.synchronizeIssue(ctx)).toBeFalsy();
      expect(logger.notice).toBeCalledWith("Failed fetching project values. Skipping project field assignment.");
      expect(projectKit.changeIssueStateInProject).toHaveBeenCalledTimes(0);
    });
  });
});
