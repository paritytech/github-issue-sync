/* eslint-disable @typescript-eslint/unbound-method */
import { mock, mockReset } from "jest-mock-extended";

import { IIssues, ILogger, IProjectApi, Issue } from "src/github/types";
import { Synchronizer } from "src/synchronizer";

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
    issueKit.getAllIssues.mockReturnValue(Promise.resolve([]));
    await synchronizer.synchronizeIssue({ eventName: "workflow_dispatch", payload: {} });

    expect(logger.notice).toBeCalledWith("Closed issues will be synced.");
  });

  test("should log when only open issues will be synced", async () => {
    issueKit.getAllIssues.mockReturnValue(Promise.resolve([]));
    await synchronizer.synchronizeIssue({
      eventName: "workflow_dispatch",
      payload: { inputs: { excludeClosed: "true" } },
    });

    expect(logger.notice).toBeCalledWith("Closed issues will NOT be synced.");
  });

  test("should invoke project.assignIssue", async () => {
    const issueNumber = Math.floor(Math.random() * 100);
    const nodeData = { id: "id", title: "title" };
    projectKit.fetchProjectData.mockResolvedValue(nodeData);
    await synchronizer.synchronizeIssue({
      eventName: "issues",
      payload: { issue: { node_id: "1234321", number: issueNumber } },
    });

    logger.info.calledWith(`Assigning issue #${issueNumber} to project`);
    projectKit.assignIssue.calledWith({ node_id: "1234321", number: issueNumber }, nodeData);
  });

  test("should call project.assignIssues with an iteration", async () => {
    const issues: Issue[] = [
      { number: 123, node_id: "asd_dsa" },
      { number: 987, node_id: "poi_lkj" },
    ];
    issueKit.getAllIssues.mockResolvedValue(issues);
    projectKit.assignIssue.mockResolvedValue("");
    await synchronizer.synchronizeIssue({ eventName: "workflow_dispatch", payload: {} });

    // projectKit.assignIssue.calledWith("");
  });
});
