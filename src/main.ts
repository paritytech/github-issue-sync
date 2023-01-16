import { debug, getInput, info, notice, setFailed, warning } from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { IssueApi } from "./github/issueKit";
import { ProjectKit } from "./github/projectKit";
import { Issue } from "./github/types";
import { Synchronizer } from "./synchronizer";

type ActionInputs = { repoToken: string, orgToken: string, projectNumber: number };

type EventNames = "workflow_dispatch" | "issues";

const main = async (inputs: ActionInputs) => {
    info("Starting event of type " + context.eventName);

    const { repo, eventName } = context;

    const kit = getOctokit(inputs.repoToken);
    const issueKit = new IssueApi(kit, repo);
    const projectGraphQl = getOctokit(inputs.orgToken).graphql.defaults({ headers: { authorization: `token ${inputs.orgToken}` } });
    const projectKit = new ProjectKit(projectGraphQl, repo, inputs.projectNumber);

    const synchronizer = new Synchronizer(issueKit, projectKit);

    if ((eventName as EventNames) === "workflow_dispatch") {
        // ! remember to put this in the documentation and log it with some info tag
        const excludeClosed = (context.payload.inputs.excludeClosed as "true" | "false") === "true";
        notice(excludeClosed ? "Closed issues will NOT be synced." : "Closed issues will be synced.");
        await synchronizer.updateAllIssues(excludeClosed);
    } else if ((eventName as EventNames) === "issues") {
        const { issue } = context.payload;
        if (!issue) {
            throw new Error("Issue payload object was null");
        }
        debug(`Received issue ${JSON.stringify(context.payload.issue)}`);
        info(`Assigning issue #${issue?.number} to project`);
        await synchronizer.updateOneIssue(issue as Issue);
    } else {
        const failMessage = `Event '${eventName}' is not expected. Failing.`;
        warning(failMessage)
        setFailed(failMessage);
        throw new Error(failMessage);
    }

}

const getInputs = (): ActionInputs => {
    const repoToken = getInput("GITHUB_TOKEN", { required: true });
    const orgToken = getInput("PROJECT_TOKEN", { required: true });

    const projectNumber = parseInt(getInput("project", { required: true }));
    // TODO: Add support for custom project fields (https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields)

    return { repoToken, orgToken, projectNumber };
}

const inputs = getInputs();

main(inputs)
    .then(() => info("Finished"))
    .catch(setFailed);
