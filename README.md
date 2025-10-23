<div align="center">

<img src="https://raw.githubusercontent.com/ietf-tools/common/main/assets/logos/semver-action.svg" alt="Semver Github Action" height="125" />

[![Release](https://img.shields.io/github/release/ietf-tools/semver-action.svg?style=flat&maxAge=600)](https://github.com/ietf-tools/semver-action/releases)
[![License](https://img.shields.io/github/license/ietf-tools/semver-action)](https://github.com/ietf-tools/semver-action/blob/main/LICENSE)

##### Semver Conventional Commits - Github Action

</div>

---

This GitHub Action automatically determinate the next release version to use based on all the [Conventional Commits](https://www.conventionalcommits.org) since the latest tag.

- [Example Workflow](#example-workflow)
- [Inputs](#inputs)
- [Outputs](#outputs)

> Works great alongside the [Changelog from Conventional Commits](https://github.com/marketplace/actions/changelog-from-conventional-commits) action!

## Example workflow
``` yaml
name: Deploy

on:
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Get Next Version
        id: semver
        uses: ietf-tools/semver-action@v1
        with:
          token: ${{ github.token }}
          branch: main

      - name: Create Release
        uses: ncipollo/release-action@v1.12.0
        with:
          allowUpdates: true
          draft: false
          makeLatest: true
          name: ${{ steps.semver.outputs.next }}
          body: Changelog Contents
          token: ${{ github.token }}
```

## Inputs

| Field | Description | Required | Default |
|---|---|:----:|---|
| `token` | Your GitHub token. (e.g. `${{ github.token }}`) | :white_check_mark: |  |
| `branch` | The branch to use when fetching list of commits to compare against. (e.g. `main`) | :x: | `main` |
| `majorList` | Comma separated commit prefixes, used to bump Major version.  *A `BREAKING CHANGE` note in a commit message will still cause a major bump.* | :x: |  |
| `minorList` | Comma separated commit prefixes, used to bump Minor version. | :x: | `feat, feature` |
| `patchList` | Comma separated commit prefixes, used to bump Patch version. | :x: | `fix, bugfix, perf, refactor, test, tests` |
| `patchAll` | If set to `true`, will ignore `patchList` and always count commits as a Patch. | :x: | `false` |
| `additionalCommits` | A list of additional commit messages to parse in order to calculate semver. | :x: |  |
| `fallbackTag` | A fallback tag to use if no valid latest tag can be found. The fallback tag must exist already. | :x: |  |
| `fromTag` | Override the tag to use when comparing against the branch in order to fetch the list of commits. | :x: |  |
| `maxTagsToFetch` | Maximum number of tags to fetch from latest (between `1` and `100`). | :x: | `10` |
| `noNewCommitBehavior` | Whether to exit with an error *(default)*, a warning, the current version or silently when there are no new commits since the latest tag. (Possible values: `error`, `warn`, `current` or `silent`) | :x: | `error` |
| `noVersionBumpBehavior` | Whether to exit with an error *(default)*, a warning, silently, the current version or force bump using patch when none of the commits result in a version bump. (Possible values: `error`, `warn`, `current`, `patch` or `silent`) | :x: | `error` |
| `prefix` | A prefix that will be striped when parsing tags (e.g. `foobar/`). Any other prefix will be ignored. Useful for monorepos. The prefix will be added back to the output values. | :x: |  |
| `skipInvalidTags` | If set to `true`, will skip tags that are not valid semver until it finds a proper one (up to `maxTagsFetch` from latest). | :x: | `false` |
| `tagFilter` | If defined, only tags matching the regex pattern will be included (e.g. `^[a-f0-9.]+$`). Use a negative lookahead match to exclude tags (e.g. `^(?!abcd).*$`). When used in conjunction with the prefix option, the prefix is striped first, then the filter is applied. | :x: |  |
| `scopeFilter` | Comma-separated list of scopes to include. When set, only commits whose conventional-commit scope matches one of these values will be considered. Leave empty to consider all scopes. Useful for monorepos. | :x: |  |

## Outputs

| Field             | Description                                                 | Example Value |
|-------------------|-------------------------------------------------------------|---------------|
| `current`         | Current version number / latest tag.                        | `v1.1.9`      |
| `next`            | Next version number in format `v0.0.0`                      | `v1.2.0`      |
| `nextStrict`      | Next version number without the `v` prefix.                 | `1.2.0`       |
| `nextMajor`       | Next version major number in format `v0`                    | `v1`          |
| `nextMajorStrict` | Next version major number only.                             | `1`           |
| `bump`            | Next version behavior: `major`, `minor`, `patch` or `none`. | `minor`       |

## Using scopeFilter for Monorepos

If you set `scopeFilter` to a comma-separated list of scopes (for example `cli,api`) the action will only consider commits with those scopes when calculating the next version. This is useful in monorepos where you want to run per-package releases.

Example:

```yaml
uses: ietf-tools/semver-action@v1
with:
  token: ${{ secrets.GITHUB_TOKEN }}
  branch: main
  prefix: 'cli-v'
  minorList: feat
  patchList: fix
  scopeFilter: cli
```

**Notes:**
- `scopeFilter` does an exact match against the parsed conventional-commit scope (after trimming). A commit without a scope is treated as an empty scope.
- If `scopeFilter` is empty (default), behavior is unchanged and all commits are considered.

## :warning: Important :warning:

If no valid latest tag is found and no `fallbackTag` is provided, the job will exit with an error. To avoid this, you can use the `fallbackTag` option to specify a default tag value (e.g. `0.0.0`).
