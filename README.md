# Introduction

This project enables syncing GitHub Issues to a
[GitHub Project](https://docs.github.com/en/issues/trying-out-the-new-projects-experience).
It can be used either as a [GitHub App](#app) or a [GitHub Action](#action).

## TOC

- [GitHub App](#app)
  - [API](#app-api)
    - [Create a rule](#app-api-create-rule)
      - [Unfiltered Rule](#app-api-unfiltered-rule)
      - [Filtered Rule](#app-api-filtered-rule)
    - [Update a rule](#app-api-update-rule)
    - [Fetch a rule](#app-api-fetch-rule)
    - [List all rules for a specific repository](#app-api-list-repository-rules)
    - [List all rules](#app-api-list-rules)
    - [Delete a rule](#app-api-delete-rule)
    - [Delete all rules for a specific repository](#app-api-delete-repository-rules)
    - [Create a token](#app-api-create-token)
    - [Delete a token](#app-api-delete-token)
  - [Development](#app-development)
    - [Local setup](#app-development-local-setup)
    - [Database migrations](#app-development-database-migrations)
  - [Dependencies](#app-dependencies)
  - [Settings](#app-settings)
  - [Configuration](#app-configuration)
- [GitHub Action](#action)
  - [Build](#action-build)
    - [Build steps](#action-build-steps)
  - [Trial](#action-trial)
    - [Trial steps](#action-trial-steps)
  - [Release](#action-release)
    - [Release steps](#action-release-steps)
  - [Workflow configuration](#action-workflow-configuration)
  - [Install](#action-install)

# GitHub App <a name="app"></a>

A GitHub App is ran **as a service** by executing the main entrypoint; consult
the [Dockerfile](./src/server/Dockerfile) to have an idea for how to start the
server.

The application is composed of

- A web server for receiving GitHub [Webhook events](#app-events) via HTTP POST
- A database for storing [Rules](#app-api-create-rule)

<a name="app-events"></a>
The following events trigger the synchronization of an issue into the project
targetted by a [Rule](#app-api-create-rule):

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
[Create token](#app-api-create-token) endpoint.

### Create a rule <a name="app-api-create-rule"></a>

`POST /api/v1/rule/repository/:owner/:name`

This endpoint is used to create a **Rule** for a given repository. A Rule
specifies how issues for a repository are synced to a target project. Please
check the type of `IssueToProjectFieldRuleCreationInput` in
[the source types](./src/server/types.ts) for all the available fields.

Keep track of the returned ID in case you want to
[update the rule later](#app-api-update-rule); regardless, all IDs can be
retrieved at any point by using the [listing endpoint](#app-api-list-rules).

#### Unfiltered Rule <a name="app-api-unfiltered-rule"></a>

If a Rule is specified with no filter, **any** issue associated with the
[incoming events](#app-events) will be registered to the board.

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
[can be deleted](#app-api-delete-token).

Note that [`$API_CONTROL_TOKEN`](#app-configuration) should be used as a token
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

## Development <a name="app-development"></a>

### Local setup <a name="app-development-local-setup"></a>

1. [Register a GitHub App](https://probot.github.io/docs/deployment/#register-the-github-app)
   - https://docs.github.com/en/developers/apps/building-github-apps/creating-a-github-app
   - https://probot.github.io/docs/development/
2. [Set the appropriate permissions on the GitHub App](#app-settings)
3. Install the GitHub App in a repository by clicking the "Install" button
   on the settings page of your app (`https://github.com/apps/${app}`)
4. Copy [src/server/.env.example.cjs](./src/server/.env.example.cjs) to
  `src/server/.env.cjs` and edit it according to the instructions in the file
5. Run `yarn` to install the dependencies
6. Start the Postgres instance
  - <a name="database-container"></a> Through `docker`: take the
    DB_PASSWORD and DB_USER from `src/server/.env.cjs` and run
    `docker run --rm -e POSTGRES_PASSWORD=$DB_PASSWORD -e POSTGRES_USER=$DB_USER postgres`
  - For a local instance, make sure the configuration in `src/server/.env.cjs`
    is correct
7. [Apply all database migrations](#apply-migrations)
8. Run `yarn dev` to start a development server or `yarn watch` for a
   development server which automatically restarts when you make changes to the
   source files
9. Trigger the relevant events in the GitHub repository where you've installed
   the application (Step 3) and check if it works

### Database migrations <a name="app-development-database-migrations"></a>

Database migrations live in the [migrations directory](./src/server/migrations).

Migrations are executed in ascending order by the file name. The format for
their files names is `${TIMESTAMP}_${TITLE}.ts`.

- Apply all pending migrations: `yarn migrations:up` <a name="apply-migrations"></a>
- Rollback a single migration: `yarn migrations:down`
- Create a new migration: `yarn migrations:create [name]`

Check the
[official documentation](https://github.com/salsita/node-pg-migrate/blob/master/docs/cli.md)
for more details.

## Dependencies <a name="app-dependencies"></a>

- `Node.js` for running the application
- `yarn` for installing packages and starting scripts
- `jq` for the filtering expressions on [Rules](#app-api-create-rule)
- `postgres` for the database
  - For local development we recommend
    [running a Postgres instance through `docker`](#database-container)

## Settings <a name="app-settings"></a>

The permissions and event subscriptions can be configured at
`https://github.com/settings/apps/${app}/permissions`

### Repository permissions

- Issues: Read-only
  - Allows subscription to the "Issues" event

### Organization permissions

- Projects: Read & write
  - Allows for items to be created in
    [GitHub Project](https://docs.github.com/en/issues/trying-out-the-new-projects-experience)s.

### Events subscriptions

- Issues
  - Events used to trigger syncing for our primary use-case

## Configuration <a name="app-configuration"></a>

Consult [.env.example.cjs](./src/server/.env.example.cjs) for the explanation on
each environment variable relevant for this application.

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
