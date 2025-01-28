const core = require('@actions/core')
const _ = require('lodash')

const semver = require('semver')

const {
  outputVersion,
  processAdditionalCommitsList,
  getBumpTypes,
  getChanges,
  getBump
} = require('./functions')

/**
 * Main
 */
async function main () {
  const token = core.getInput('token')

  const GHClient = require('./ghc')
  const ghc = new GHClient(token)

  const branch = core.getInput('branch')
  const skipInvalidTags = core.getBooleanInput('skipInvalidTags')
  const noVersionBumpBehavior = core.getInput('noVersionBumpBehavior')
  const noNewCommitBehavior = core.getInput('noNewCommitBehavior')
  const prefix = core.getInput('prefix') || ''
  const additionalCommits = processAdditionalCommitsList(core.getInput('additionalCommits'))
  const fromTag = core.getInput('fromTag')
  const maxTagsToFetch = _.toSafeInteger(core.getInput('maxTagsToFetch') || 10)
  const fetchLimit = (maxTagsToFetch < 1 || maxTagsToFetch > 100) ? 10 : maxTagsToFetch
  const fallbackTag = core.getInput('fallbackTag')

  let tag = null

  if (!fromTag) {
    // GET LATEST + PREVIOUS TAGS
    tag = ghc.getLatestTag(fetchLimit, prefix, fallbackTag, skipInvalidTags)
    core.info(`Comparing against latest tag: ${prefix}${tag.name}`)
  } else {
    // GET SPECIFIC TAG
    tag = ghc.getSpecificTag(prefix, fromTag)
    core.info(`Comparing against provided tag: ${prefix}${tag.name}`)
  }

  // OUTPUT CURRENT VARS

  core.exportVariable('current', `${prefix}${tag.name}`)
  core.setOutput('current', `${prefix}${tag.name}`)

  // GET COMMITS
  const commits = ghc.getCommits(branch, tag, prefix, additionalCommits, noNewCommitBehavior)

  // PARSE COMMITS
  const bumpTypes = getBumpTypes(
    core.getInput('majorList'),
    core.getInput('minorList'),
    core.getInput('patchList'),
    core.getInput('patchAll')
  )
  const changes = getChanges(commits, bumpTypes)

  // DETERMINE BUMP
  let bump = getBump(changes, noVersionBumpBehavior)
  if (!bump) {
    switch (noVersionBumpBehavior) {
      case 'current': {
        core.info('No commit resulted in a version bump since last release! Exiting with current as next version...')
        outputVersion(semver.clean(tag.name))
        return
      }
      case 'patch': {
        core.info('No commit resulted in a version bump since last release! Defaulting to using PATCH...')
        bump = 'patch'
        break
      }
      case 'silent': {
        return core.info('No commit resulted in a version bump since last release! Exiting silently...')
      }
      case 'warn': {
        return core.warning('No commit resulted in a version bump since last release!')
      }
      default: {
        return core.setFailed('No commit resulted in a version bump since last release!')
      }
    }
  }

  core.info(`\n>>> Will bump version ${prefix}${tag.name} using ${bump.toUpperCase()}\n`)
  core.setOutput('bump', bump || 'none')

  // BUMP VERSION

  const next = semver.inc(tag.name, bump)

  core.info(`Current version is ${prefix}${tag.name}`)
  core.info(`Next version is ${prefix}v${next}`)

  outputVersion(next)
}

// RUN MAIN
main()
