# Introduction

This project enables syncing GitHub Issues to a
[GitHub Project](https://docs.github.com/en/issues/trying-out-the-new-projects-experience).
It can be used either as a [Service](#service) or a [GitHub Action](#action).

Before starting to work on this project, we recommend reading the
[Implementation section](#implementation).

## TOC

- [Service](#service)
  - [API](#service-api)
    - [Create a rule](#service-api-create-rule)
      - [Unfiltered Rule](#service-api-unfiltered-rule)
      - [Filtered Rule](#service-api-filtered-rule)
    - [Update a rule](#service-api-update-rule)
    - [Fetch a rule](#service-api-fetch-rule)
    - [List all rules for a specific repository](#service-api-list-repository-rules)
    - [List all rules](#service-api-list-rules)
    - [Delete a rule](#service-api-delete-rule)
    - [Delete all rules for a specific repository](#service-api-delete-repository-rules)
    - [Create a token](#service-api-create-token)
    - [Delete a token](#service-api-delete-token)
  - [GitHub App](#service-github-app)
    - [Configuration](#service-github-app-configuration)
    - [Installation](#service-github-app-installation)
  - [Setup](#service-setup)
    - [Requirements](#service-setup-requirements)
    - [Environment variables](#service-setup-environment-variables)
  - [Development](#service-development)
    - [Run the application](#service-development-run)
    - [Database migrations](#service-development-database-migrations)
  - [Deployment](#service-deployment)
    - [Manual deployment](#service-deployment-manual)
  - [Implementation](#implementation)
- [GitHub Action](#action)
  - [Build](#action-build)
    - [Build steps](#action-build-steps)
  - [Trial](#action-trial)
    - [Trial steps](#action-trial-steps)
  - [Release](#action-release)
    - [Release steps](#action-release-steps)
  - [Workflow configuration](#action-workflow-configuration)
  - [Install](#action-install)
- [Implementation](#implementation)

# Service <a name="service"></a>

The github-issue-sync service implements a [GitHub App](#service-github-app)
which is started by the [main entrypoint](./src/server/main.ts); consult the
[Dockerfile](./src/server/Dockerfile) for running the server or
[docker-compose.yml](./docker-compose.yml) for the whole application.

It is composed of

- A web server for receiving GitHub [Webhook events](#service-events) via HTTP
  POST
- A database for storing [Rules](#service-api-create-rule)

<a name="app-events"></a>
The following events trigger the synchronization of an issue into the project
targetted by a [Rule](#service-api-create-rule):

- [`issues.opened`](https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads#webhook-payload-object-18)
  - Happens when a new issue is created in a repository
- [`issues.reopened`](https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads#webhook-payload-object-18)
  - Happens when a new issue is reopened in a repository
- [`issues.labeled`](https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads#webhook-payload-object-18)
  - Happens when a label is added to an issue

## API <a name="app-api"></a>

An HTTP API is provided for the sake of enabling configuration at runtime. The
following sections will showcase examples of how to use said API through `curl`.

All API calls are protected by tokens which should be registered by the
[Create token](#service-api-create-token) endpoint.

### Create a rule <a name="app-api-create-rule"></a>

`POST /api/v1/rule/repository/:owner/:name`

This endpoint is used to create a **Rule** for a given repository. A Rule
specifies how issues for a repository are synced to a target project. Please
check the type of `IssueToProjectFieldRuleCreationInput` in
[the source types](./src/server/types.ts) for all the available fields.

Keep track of the returned ID in case you want to
[update the rule later](#service-api-update-rule); regardless, all IDs can be
retrieved at any point by using the [listing endpoint](#service-api-list-rules).

#### Unfiltered Rule <a name="app-api-unfiltered-rule"></a>

If a Rule is specified with no filter, **any** issue associated with the
[incoming events](#service-events) will be registered to the board.

```
curl \
  -H "x-auth: $token" \
  -H "Content-Type: application/json" \
  -X POST "http://github-issue-sync/api/v1/rule/repository/$owner/$name" \
  -d '{
    "project_number": 1,
    "project_field": "Status",
    "project_field_value": "Done"
  }'
```

#### Filtered Rule <a name="app-api-filtered-rule"></a>

Optionally it's possible to specify a
[`jq` expression](https://stedolan.github.io/jq/manual/)
([the cookbook](https://github.com/stedolan/jq/wiki/Cookbook) might be helpful)
in the `"filter"` field to be tested against the
[`"issue"` object in the webhook's payload](https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads#webhook-payload-example-when-someone-edits-an-issue).

If a filter is defined, the rule will only be triggered if its filter outputs a
non-empty string. For example, if you want the rule to be triggered only for
issues which have an "epic" label, define the filter as follows:

```
curl \
  -H "x-auth: $token" \
  -H "Content-Type: application/json" \
  -X POST "http://github-issue-sync/api/v1/rule/repository/$owner/$name" \
  -d '{
    "filter": ".labels[] | select(.name == \"epic\")",
    "project_number": 2,
    "project_field": "Epics",
    "project_field_value": "Todo"
  }'
```

In the example above, if the issue does **not** have an "epic" label, `jq` would
not output anything according to the `"filter"` and thus the rule would not be
matched. You can verify this locally:

`jq -r -n --argjson input '{"labels":[{"name": "foo"}]}' '$input | .labels[] | select(.name == "epic")'`

### Update a rule <a name="app-api-update-rule"></a>

`PATCH /api/v1/rule/:id`

This endpoint is parameterized by a Rule ID. As the name implies, it updates an
existing rule using the request's JSON payload. Please check the type of
`IssueToProjectFieldRuleUpdateInput` in
[the source types](./src/server/types.ts) for all the available fields.

Example: Update the filter for an existing rule whose ID is `123`

```
curl \
  -H "x-auth: $token" \
  -H "Content-Type: application/json" \
  -X PATCH "http://github-issue-sync/api/v1/rule/123" \
  -d '{
    "filter": ".labels[] | select(.name == \"milestone\")"
  }'
```

### Fetch a rule <a name="app-api-fetch-rule"></a>

`GET /api/v1/rule/:id`

```
curl \
  -H "x-auth: $token" \
  -H "Content-Type: application/json" \
  -X GET "http://github-issue-sync/api/v1/rule/$id"
```

### List rules for a specific repository <a name="app-api-list-repository-rules"></a>

`GET /api/v1/rule/repository/:owner/:name`

```
curl \
  -H "x-auth: $token" \
  -H "Content-Type: application/json" \
  -X GET "http://github-issue-sync/api/v1/rule/$owner/$name"
```

### List all rules <a name="app-api-list-rules"></a>

`GET /api/v1/rule`

```
curl \
  -H "x-auth: $token" \
  -H "Content-Type: application/json" \
  -X GET "http://github-issue-sync/api/v1/rule"
```

### Delete a rule <a name="app-api-delete-rule"></a>

`DELETE /api/v1/rule/:id`

```
curl \
  -H "x-auth: $token" \
  -X DELETE "http://github-issue-sync/api/v1/rule/:id"
```

### Delete all rules for a specific repository <a name="app-api-delete-repository-rules"></a>

`DELETE /api/v1/rule/repository/:owner/:name`

```
curl \
  -H "x-auth: $token" \
  -X DELETE "http://github-issue-sync/api/v1/rule/$owner/$name"
```

### Create a token <a name="app-api-create-token"></a>

`POST /api/v1/token`

This API will respond with the newly-created token which later
[can be deleted](#service-api-delete-token).

Note that [`$API_CONTROL_TOKEN`](#service-configuration) should be used as a token
here since normal tokens are not able to create other tokens.

```
curl \
  -H "x-auth: $API_CONTROL_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "http://github-issue-sync/api/v1/token" \
  -d '{ "description": "Owned by John Smith from the CI team" }'
```

### Delete a token <a name="app-api-delete-token"></a>

`DELETE /api/v1/token`

```
curl \
  -H "x-auth: $token" \
  -H "Content-Type: application/json" \
  -X DELETE "http://github-issue-sync/api/v1/token"
```

## GitHub App <a name="app-github-app"></a>

The GitHub App is necessary for the application to receive
[webhook events](https://probot.github.io/docs/webhooks) and
access the GitHub API properly.

Follow the instructions of
<https://gitlab.parity.io/groups/parity/opstooling/-/wikis/Bots/Development/Create-a-new-GitHub-App>
for creating a new GitHub App.

After creating the app, you should [configure](#service-github-app-configuration) and
[install it](#service-github-app-installation) (make sure the
[environment](#service-setup-environment-variables) is properly set up before using it).

### Configuration <a name="app-github-app-configuration"></a>

Configuration is done at `https://github.com/settings/apps/${APP}/permissions`.

#### Repository permissions

- Issues: Read-only
  - Allows subscription to the "Issues" event

#### Organization permissions

- Projects: Read & write
  - Allows for items to be created in
    [GitHub Project](https://docs.github.com/en/issues/trying-out-the-new-projects-experience)s.

#### Events subscriptions

- Issues
  - Events used to trigger syncing for our primary use-case

### Installation <a name="app-github-app-installation"></a>

Having [created](#service-github-app) and
[configured](#service-github-app-configuration) the GitHub App, install it in a
repository through `https://github.com/settings/apps/${APP}/installations`.

## Setup <a name="app-setup"></a>

### Requirements <a name="app-setup-requirements"></a>

- `Node.js` for running the application
- `yarn` for installing packages and starting scripts
  - If it's not already be bundled with Node.js, install with
    `npm install -g yarn`
- `jq` for the filtering expressions on [Rules](#service-api-create-rule)
- `postgres` for the database
    See <https://gitlab.parity.io/groups/parity/opstooling/-/wikis/Setup#postgres>

### Environment variables <a name="app-setup-environment-variables"></a>

All environment variables are documented in the
[src/server/.env.example.cjs](./src/server/.env.example.cjs) file. For
development you're welcome to copy that file to `src/server.env.cjs` so that all
values will be loaded automatically once the application starts.

## Development <a name="app-development"></a>

### Run the application <a name="app-development-run"></a>

1. [Set up the GitHub App](#service-github-app)
2. [Set up the application](#service-setup)

    During development it's handy to use a [smee.io](https://smee.io/) proxy,
    through the `WEBHOOK_PROXY_URL` environment variable, for receiving GitHub
    Webhook Events in your local server instance.

3. Start the Postgres instance

    See
    <https://gitlab.parity.io/groups/parity/opstooling/-/wikis/Setup#postgres>
    (use the variables of `.env.cjs` for the database configuration)

4. Run `yarn` to install the dependencies
5. [Apply all database migrations](#service-apply-migrations)
6. Run `yarn dev` to start a development server or `yarn watch` for a
  development server which automatically restarts when you make changes to the
  source files
7. Trigger [events](#service-events) in the repositories where you've installed the
  GitHub App (Step 2) and check if it works

### Database migrations <a name="app-development-database-migrations"></a>

Database migrations live in the [migrations directory](./src/server/migrations).

Migrations are executed in ascending order by the file name. The format for
their files names is `${TIMESTAMP}_${TITLE}.ts`.

- Apply all pending migrations: `yarn migrations:up` <a name="app-apply-migrations"></a>
- Rollback a single migration: `yarn migrations:down`
- Create a new migration: `yarn migrations:create [name]`

Check the
[official documentation](https://github.com/salsita/node-pg-migrate/blob/master/docs/cli.md)
for more details.

## Deployment <a name="app-deployment"></a>

TODO: Replace with the deployment workflow instructions once the deployment is ready.

TODO: Add links to Grafana logs once the deployment is ready.

### Manual deployment <a name="app-deployment-manual"></a>

The whole application can be spawned with `docker-compose up`.

For ad-hoc deployments, for instance in a VM, one idea is to use the
`docker-compose up` command in a `tmux` session. e.g.

`tmux new -s github-issue-sync sh -c "docker-compose up 2>&1 | tee -a log.txt"`

# GitHub Action <a name="action"></a>

A GitHub Action is ran **on-demand** by creating a
[workflow configuration](#action-workflow-configuration) in the default branch of
the target repository.

## Build <a name="action-build"></a>

Building entails

1. Compiling the TypeScript code to Node.js modules
2. Packaging the modules with [ncc](https://github.com/vercel/ncc)

Since the build output consists of plain .js files, which can be executed
directly by Node.js, it _could_ be ran directly without packaging first; we
regardless prefer to use `ncc` because it bundles all the code, including the
dependencies' code, into a single file ahead-of-time, meaning the workflow can
promptly start the action without having to install dependencies on every run.

### Build steps <a name="action-build-steps"></a>

1. Install the dependencies

`yarn`

2. Build the artifacts

`yarn action:build`

3. Package the action

`yarn action:package`

See the next sections for [trying it out](#action-trial) or [releasing](#action-release).

## Trial <a name="action-trial"></a>

A GitHub workflow will always clone the HEAD of `${organization}/${repo}@${ref}`
**when the action is executed**, as exemplified by the following line:

`uses: paritytech/github-issue-sync@branch`

Therefore any changes pushed to the branch will automatically be applied the
next time the action is ran.

### Trial steps <a name="action-trial-steps"></a>

1. [Build](#action-build) the changes and push them to some branch
2. Change the workflow's step from `paritytech/github-issue-sync@branch` to your
  branch:

```diff
-uses: paritytech/github-issue-sync@branch
+uses: user/fork@branch
```

3. Re-run the action and note the changes were automatically applied

## Release <a name="action-release"></a>

A GitHub workflow will always clone the HEAD of `${organization}/${repo}@${tag}`
**when the action is executed**, as exemplified by the following line:

`uses: user/github-issue-sync@tag`

That behavior makes it viable to release by committing build artifacts directly
to a tag and then using the new tag in the repositories where this action is
installed.

## Release steps <a name="action-release-steps"></a>

1. [Build](#action-build) the changes and push them to some tag
2. Use the new tag in your workflows:

```diff
-uses: user/github-issue-sync@1
+uses: user/github-issue-sync@2
```

## Workflow configuration <a name="action-workflow-configuration"></a>

```yaml
name: GitHub Issue Sync

on:
  issues:
    # https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads#issues
    types:
      - opened
      - reopened
      - labeled

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: github-issue-sync
        uses: paritytech/github-issue-sync@tag
        with:
          # The token needs to have the following permissions
          # - "read:org" is used to read the project's board
          # - "write:org" is used to assign issues to the project's board
          # - "repo" is used to access issues through the API
          token: ${{ secrets.PROJECTS_TOKEN }}

          # The number of the project which the issues will be synced to
          project: 123

          # The name of the project field which the issue will be assigned to
          target-project-field: Team

          # The value which will be set in the field, in this case the team's
          # name
          target-project-field-value: Foo
```

## Install <a name="action-install"></a>

Having [released](#action-release) the code, the final step is to copy the [workflow
configuration](#action-workflow-configuration) to the `.github/workflows` folder of
projects whose issues need to be synced.

# Implementation <a name="implementation"></a>

The [sync](https://github.com/paritytech/github-issue-sync/blob/8cb4184ab4d52e387922fb185e17236321399c85/src/core.ts#L7) is triggered from:

- [Webhook events](https://probot.github.io/docs/webhooks/) in
  [event handlers](https://github.com/paritytech/github-issue-sync/blob/8cb4184ab4d52e387922fb185e17236321399c85/src/server/event.ts#L35)
  for the [service](#service)
  - The event listeners are set up in
    [`main`](https://github.com/paritytech/github-issue-sync/blob/8cb4184ab4d52e387922fb185e17236321399c85/src/server/main.ts#L97)
- [CLI entrypoint](https://github.com/paritytech/github-issue-sync/blob/8cb4184ab4d52e387922fb185e17236321399c85/src/action/main.ts#L33)
  for the [GitHub Action](#github-acttion)
