import { debug, error, getInput, info, setFailed } from "@actions/core";
import { context, getOctokit } from "@actions/github";

import { CoreLogger } from "./github/CoreLogger";
import { IssueApi } from "./github/issueKit";
import { ProjectKit } from "./github/projectKit";
import { GitHubContext, Synchronizer } from "./synchronizer";

const getProjectFieldValues = (): { field: string; value: string } | undefined => {
  const field = getInput("project_field");
  const value = getInput("project_value");

  if (field && value) {
    return { field, value };
  } else {
    debug("'project_field' and 'project_value' are empty.");
  }
};

//* * Generates the class that will handle the project logic */
const generateSynchronizer = (): Synchronizer => {
  const repoToken = getInput("GITHUB_TOKEN", { required: true });
  const orgToken = getInput("PROJECT_TOKEN", { required: true });

  const projectNumber = parseInt(getInput("project", { required: true }));

  const { repo } = context;

  const kit = getOctokit(repoToken);
  const issueKit = new IssueApi(kit, repo);
  const projectGraphQl = getOctokit(orgToken).graphql.defaults({ headers: { authorization: `token ${orgToken}` } });
  const logger = new CoreLogger();
  const projectKit = new ProjectKit(projectGraphQl, repo, projectNumber, logger);

  return new Synchronizer(issueKit, projectKit, logger);
};

const synchronizer = generateSynchronizer();

const projectFields = getProjectFieldValues();
const { issue } = context.payload;
const parsedContext: GitHubContext = {
  eventName: context.eventName,
  payload: {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    inputs: context.payload.inputs,
    issue: issue ? { number: issue.number, node_id: issue.node_id as string } : undefined,
  },
  config: { projectField: projectFields },
};

const errorHandler = (e: Error) => {
  let er = e;
  setFailed(e);
  while (er !== null) {
    debug(`Stack -> ${er.stack as string}`);
    if (er.cause != null) {
      debug("Error has a nested error. Displaying.");
      er = er.cause as Error;
      error(er);
    } else {
      break;
    }
  }
};

synchronizer
  .synchronizeIssue(parsedContext)
  .then(() => {
    info("Operation finished successfully!");
  })
  .catch(errorHandler);
