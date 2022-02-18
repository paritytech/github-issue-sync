# Introduction

This project implements a GitHub Action which synchronizes GitHub Issues to a
[GitHub Project](https://docs.github.com/en/issues/trying-out-the-new-projects-experience).

# TOC

- [Build](#build)
  - [Build steps](#build-steps)
- [Trial](#trial)
  - [Trial steps](#trial-steps)
- [Release](#release)
  - [Release steps](#release-steps)
- [Workflow configuration](#workflow-configuration)
- [Install](#install)

# Build

Building entails

1. Compiling the TypeScript code to Node.js modules
2. Packaging the modules with [ncc](https://github.com/vercel/ncc)

Since the build output consists of plain .js files, which can be executed
directly by Node.js, it _could_ be ran directly without packaging first; we
regardless prefer to use `ncc` because it bundles all the code (_including the
dependencies' code_) into a single file ahead-of-time, meaning the workflow can
promptly start the action without having to install dependencies first for every
run.

## Build steps <a name="build-steps"></a>

1. Install the dependencies

`yarn`

2. Build the artifacts

`yarn build`

3. Package the action

`yarn package`

See the next sections for [trying it out](#trial) or [releasing](#release).

# Trial

A GitHub workflow will always clone the HEAD of `${organization}/${repo}@${ref}`
**when the action is executed**, as exemplified by the following line:

`uses: paritytech/github-issue-sync@branch`

Therefore any changes pushed to the branch will automatically be applied the
next time the action is ran.

## Trial steps <a name="trial-steps"></a>

1. [Build](#build) the changes and push them to some branch
2. Change the workflow's step from `paritytech/github-issue-sync@branch` to your
  branch:

```diff
-uses: paritytech/github-issue-sync@branch
+uses: user/fork@branch
```

3. Re-run the action and note the changes were automatically applied

# Release <a name="release"></a>

A GitHub workflow will always clone the HEAD of `${organization}/${repo}@${tag}`
**when the action is executed**, as exemplified by the following line:

`uses: paritytech/github-issue-sync@tag`

That behavior makes it viable to release by committing build artifacts directly
to a tag and then using the new tag in the repositories where this action is
installed.

# Release steps <a name="release-steps"></a>

1. [Build](#build) the changes and push them to some tag
2. Use the new tag in your workflows:

```diff
-uses: paritytech/github-issue-sync@1
+uses: paritytech/github-issue-sync@2
```

# Workflow configuration <a name="workflow-configuration"></a>

```yaml
name: GitHub Issue Sync

on:
  issues:
    # https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads#issues
    types:
      - opened
      - labeled

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: github-issue-sync
        uses: paritytech/github-issue-sync@tag
        with:
          # A token with "write:org", "read:org" and "repo" permissions
          token: ${{ secrets.PROJECTS_TOKEN }}

          # The number of the project which the issues will be synced to
          project: 123

          # The name of the project field which the issue will be assigned to
          target-project-field: Team

          # The value which will be set in the field, in this case the team's
          # name
          target-project-field-value: Foo
```

# Install <a name="install"></a>

Having [released](#release) the code, the final step is to copy the (workflow
configuration)[#workflow-configuration] to the `.github/workflows` folder of
projects whose issues need to be synced.
