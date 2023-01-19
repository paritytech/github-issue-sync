import { getInput, info, setFailed } from "@actions/core";
import { context, getOctokit } from "@actions/github";

import { CoreLogger } from "./github/CoreLogger";
import { IssueApi } from "./github/issueKit";
import { ProjectKit } from "./github/projectKit";
import { GitHubContext, Synchronizer } from "./synchronizer";

//* * Generates the class that will handle the project logic */
const generateSynchronizer = (): Synchronizer => {
  const repoToken = getInput("GITHUB_TOKEN", { required: true });
  const orgToken = getInput("PROJECT_TOKEN", { required: true });

  const projectNumber = parseInt(getInput("project", { required: true }));
  // TODO: Add support for custom project fields (https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields)
  const projectField = getInput("project-field");
  const projectValue = getInput("project-value");

  const { repo } = context;

  const kit = getOctokit(repoToken);
  const issueKit = new IssueApi(kit, repo);
  const projectGraphQl = getOctokit(orgToken).graphql.defaults({ headers: { authorization: `token ${orgToken}` } });
  const logger = new CoreLogger();
  const projectKit = new ProjectKit(projectGraphQl, repo, projectNumber, logger, {
    field: projectField,
    value: projectValue,
  });

  return new Synchronizer(issueKit, projectKit, logger);
};

const synchronizer = generateSynchronizer();

const { issue } = context.payload;
const parsedContext: GitHubContext = {
  eventName: context.eventName,
  payload: {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    inputs: context.payload.inputs,
    issue: issue ? { number: issue.number, node_id: issue.node_id as string } : undefined,
  },
};

synchronizer
  .synchronizeIssue(parsedContext)
  .then(() => info("Finished"))
  .catch(setFailed);
