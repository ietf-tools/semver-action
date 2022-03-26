<div align="center">

<img src="https://raw.githubusercontent.com/ietf-tools/common/main/assets/logos/semver-action.svg" alt="Semver Github Action" height="125" />

[![Release](https://img.shields.io/github/release/ietf-tools/semver-action.svg?style=flat&maxAge=600)](https://github.com/ietf-tools/semver-action/releases)
[![License](https://img.shields.io/github/license/ietf-tools/semver-action)](https://github.com/ietf-tools/semver-action/blob/main/LICENSE)

##### Semver Conventional Commits - Github Action

</div>

---

This GitHub Action automatically determinate the next release version to use based on all the [Conventional Commits](https://www.conventionalcommits.org) since the latest tag.

## Example workflow
``` yaml
name: Deploy

on:
  push:
    tags:
      - v[0-9]+.[0-9]+.[0-9]+

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v2

      - name: Get Next Version
        id: semver
        uses: ietf-tools/semver-action@v1
        with:
          token: ${{ github.token }}
          branch: main

      - name: Create Release
        uses: ncipollo/release-action@v1
        with:
          allowUpdates: true
          draft: false
          name: ${{ steps.semver.outputs.next }}
          body: Changelog Contents
          token: ${{ github.token }}
```

## Inputs
* `token`: Your GitHub token (e.g. `${{ github.token }}`) - **REQUIRED**
* `branch`: The branch to use when fetching list of commits to compare against. (e.g. `main`) - **Optional**
* `majorList`: Comma separated commit prefixes, used to bump Major version. Defaults to empty. *A `BREAKING CHANGE` note in a commit message will still cause a major bump.* - **Optional**
* `minorList`: Comma separated commit prefixes, used to bump Minor version. Defaults to (`feat, feature`) - **Optional**
* `patchList`: Comma separated commit prefixes, used to bump Patch version. Defaults to (`fix, bugfix, perf, refactor, test, tests`) - **Optional**
* `patchAll`: If set to `true`, will ignore `patchList` and always count commits as a Patch. Defaults to `false` - **Optional**

## Outputs
* `current`: Current version number / Latest tag
* `next`: Next version number in format v0.0.0
* `nextStrict`: Next version number without the v prefix

## Important

You must already have an existing tag in your repository. The job will exit with an error if it can't find the latest tag to compare against!
