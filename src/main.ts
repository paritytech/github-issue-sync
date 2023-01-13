import { error, getInput, info } from "@actions/core";
import { context } from "@actions/github";

type ActionInputs = { repoToken: string, orgToken: string, projectNumber: number };

const main = async (inputs: ActionInputs) => {
    info("Starting event of type " + context.eventName);

    const {
        payload: { issue },
        repo,
    } = context;

    info(`Received issue ${JSON.stringify(issue)}`);
    info(`Received payload ${JSON.stringify(context.payload)}`);
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
    .catch(error);
