# Semver Conventional Commits - Github Action

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
* `tag`: The latest tag which triggered the job. (e.g. `${{ github.ref_name }}`) - **Optional**

## Outputs
* `next`: Next version number in format v0.0.0
* `nextStrict`: Next version number without the v prefix

## Important

You must already have an existing tag in your repository. The job will exit with an error if it can't find the latest tag to compare against!
