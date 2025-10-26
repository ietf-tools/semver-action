const github = require('@actions/github')
const core = require('@actions/core')
const _ = require('lodash')
const cc = require('@conventional-commits/parser')
const semver = require('semver')

async function main () {
  const token = core.getInput('token')
  const branch = core.getInput('branch')
  const gh = github.getOctokit(token)
  const owner = github.context.repo.owner
  const repo = github.context.repo.repo
  const skipInvalidTags = core.getBooleanInput('skipInvalidTags')
  const noVersionBumpBehavior = core.getInput('noVersionBumpBehavior')
  const noNewCommitBehavior = core.getInput('noNewCommitBehavior')
  const prefix = core.getInput('prefix') || ''
  const additionalCommits = core.getInput('additionalCommits').split('\n').map(l => l.trim()).filter(l => l !== '')
  const fromTag = core.getInput('fromTag')
  const maxTagsToFetch = _.toSafeInteger(core.getInput('maxTagsToFetch') || 10)
  const fetchLimit = (maxTagsToFetch < 1 || maxTagsToFetch > 100) ? 10 : maxTagsToFetch
  const fallbackTag = core.getInput('fallbackTag')
  const tagFilter = core.getInput('tagFilter')
  const scopeList = core.getInput('scopeList').split(',').map(s => s.trim()).filter(s => s !== '')

  const bumpTypes = {
    major: core.getInput('majorList').split(',').map(p => p.trim()).filter(p => p),
    minor: core.getInput('minorList').split(',').map(p => p.trim()).filter(p => p),
    patch: core.getInput('patchList').split(',').map(p => p.trim()).filter(p => p),
    patchAll: (core.getInput('patchAll') === true || core.getInput('patchAll') === 'true')
  }

  function outputVersion (version) {
    core.exportVariable('next', `${prefix}v${version}`)
    core.exportVariable('nextStrict', `${prefix}${version}`)

    core.setOutput('next', `${prefix}v${version}`)
    core.setOutput('nextStrict', `${prefix}${version}`)
    core.setOutput('nextMajor', `${prefix}v${semver.major(version)}`)
    core.setOutput('nextMajorStrict', `${prefix}${semver.major(version)}`)
  }

  let latestTag = null

  if (!fromTag) {
    // GET LATEST + PREVIOUS TAGS

    const tagsRaw = await gh.graphql(`
      query lastTags (
        $owner: String!
        $repo: String!
        $fetchLimit: Int
        ) {
        repository (
          owner: $owner
          name: $repo
          ) {
          refs(
            first: $fetchLimit
            refPrefix: "refs/tags/"
            orderBy: { field: TAG_COMMIT_DATE, direction: DESC }
            ) {
            nodes {
              name
              target {
                oid
              }
            }
          }
        }
      }
    `,
    {
      owner,
      repo,
      fetchLimit
    })

    const tagsList = _.get(tagsRaw, 'repository.refs.nodes', [])
    if (tagsList.length < 1) {
      if (fallbackTag && semver.valid(fallbackTag)) {
        core.info(`Using fallback tag: ${fallbackTag}`)
        latestTag = { name: fallbackTag }
      } else {
        return core.setFailed('Couldn\'t find the latest tag. Make sure you have at least one tag created or provide a fallbackTag!')
      }
    }

    let tagFilterRgx = null
    if (tagFilter) {
      core.info(`Will filter tags based on pattern: ${tagFilter}`)
      tagFilterRgx = new RegExp(tagFilter)
    }

    let idx = 0
    for (const tag of tagsList) {
      if (prefix) {
        if (tag.name.indexOf(prefix) === 0) {
          tag.name = tag.name.replace(prefix, '')
        } else {
          continue
        }
      }

      if (tagFilterRgx && !tagFilterRgx.test(tag.name)) {
        continue
      }

      if (semver.valid(tag.name)) {
        latestTag = tag
        break
      } else if (idx === 0 && !skipInvalidTags) {
        break
      }
      idx++
    }

    if (!latestTag) {
      if (fallbackTag && semver.valid(fallbackTag)) {
        core.info(`Using fallback tag: ${fallbackTag}`)
        latestTag = { name: fallbackTag }
      } else {
        if (prefix) {
          return core.setFailed(`None of the ${fetchLimit} latest tags are valid semver or match the specified prefix!`)
        } else {
          return core.setFailed(skipInvalidTags ? `None of the ${fetchLimit} latest tags are valid semver!` : 'Latest tag is invalid (does not conform to semver)!')
        }
      }
    }

    core.info(`Comparing against latest tag: ${prefix}${latestTag.name}`)
  } else {
    // GET SPECIFIC TAG

    const tagRaw = await gh.graphql(`
      query singleTag ($owner: String!, $repo: String!, $tag: String!) {
        repository (owner: $owner, name: $repo) {
          ref(qualifiedName: $tag) {
            name
            target {
              oid
            }
          }
        }
      }
    `, {
      owner,
      repo,
      tag: `refs/tags/${prefix}${fromTag}`
    })

    latestTag = _.get(tagRaw, 'repository.ref')

    if (!latestTag) {
      return core.setFailed('Provided tag could not be found!')
    }
    if (prefix && latestTag.name.indexOf(prefix) === 0) {
      latestTag.name = latestTag.name.replace(prefix, '')
    }
    if (!semver.valid(latestTag.name)) {
      return core.setFailed('Provided tag is invalid! (does not conform to semver)')
    }

    core.info(`Comparing against provided tag: ${prefix}${latestTag.name}`)
  }

  // OUTPUT CURRENT VARS

  core.exportVariable('current', `${prefix}${latestTag.name}`)
  core.setOutput('current', `${prefix}${latestTag.name}`)

  // GET COMMITS

  let curPage = 0
  let totalCommits = 0
  let hasMoreCommits = false
  const commits = []
  do {
    hasMoreCommits = false
    curPage++
    const commitsRaw = await gh.rest.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${prefix}${latestTag.name}...${branch}`,
      page: curPage,
      per_page: 100
    })
    totalCommits = _.get(commitsRaw, 'data.total_commits', 0)
    const rangeCommits = _.get(commitsRaw, 'data.commits', [])
    commits.push(...rangeCommits)
    if ((curPage - 1) * 100 + rangeCommits.length < totalCommits) {
      hasMoreCommits = true
    }
  } while (hasMoreCommits)

  if (additionalCommits && additionalCommits.length > 0) {
    commits.push(...additionalCommits.map(ac => ({ commit: { message: ac }, sha: 'unknown' })))
  }

  if (!commits || commits.length < 1) {
    switch (noNewCommitBehavior) {
      case 'current': {
        core.info('Couldn\'t find any commits between branch HEAD and latest tag. Exiting with current as next version...')
        outputVersion(semver.clean(latestTag.name))
        return
      }
      case 'silent': {
        return core.info('Couldn\'t find any commits between branch HEAD and latest tag. Exiting silently...')
      }
      case 'warn': {
        return core.warning('Couldn\'t find any commits between branch HEAD and latest tag.')
      }
      default: {
        return core.setFailed('Couldn\'t find any commits between branch HEAD and latest tag.')
      }
    }
  }

  // PARSE COMMITS

  const majorChanges = []
  const minorChanges = []
  const patchChanges = []
  for (const commit of commits) {
    try {
      const cAst = cc.toConventionalChangelogFormat(cc.parser(commit.commit.message))

      if (scopeList && scopeList.length > 0) {
        const commitScope = (cAst.scope || '').toString()
        if (commitScope.length > 0) {
          if (!scopeList.includes(commitScope)) {
            core.info(`[SKIP] Commit ${commit.sha} has scope '${commitScope}', which does not match allowed scopes: ${scopeList.join(', ')}.`)
            continue
          }
        } else {
          core.info(`[SKIP] Commit ${commit.sha} has no scope and will be excluded as scopeList is defined.`)
          continue
        }
      }

      if (bumpTypes.major.includes(cAst.type)) {
        majorChanges.push(commit.commit.message)
        core.info(`[MAJOR] Commit ${commit.sha} of type ${cAst.type} will cause a major version bump.`)
      } else if (bumpTypes.minor.includes(cAst.type)) {
        minorChanges.push(commit.commit.message)
        core.info(`[MINOR] Commit ${commit.sha} of type ${cAst.type} will cause a minor version bump.`)
      } else if (bumpTypes.patchAll || bumpTypes.patch.includes(cAst.type)) {
        patchChanges.push(commit.commit.message)
        core.info(`[PATCH] Commit ${commit.sha} of type ${cAst.type} will cause a patch version bump.`)
      } else {
        core.info(`[SKIP] Commit ${commit.sha} of type ${cAst.type} will not cause any version bump.`)
      }
      for (const note of cAst.notes) {
        if (note.title === 'BREAKING CHANGE') {
          majorChanges.push(commit.commit.message)
          core.info(`[MAJOR] Commit ${commit.sha} has a BREAKING CHANGE mention, causing a major version bump.`)
        }
      }
    } catch (err) {
      core.info(`[INVALID] Skipping commit ${commit.sha} as it doesn't follow conventional commit format.`)
    }
  }

  let bump = null
  if (majorChanges.length > 0) {
    bump = 'major'
  } else if (minorChanges.length > 0) {
    bump = 'minor'
  } else if (patchChanges.length > 0) {
    bump = 'patch'
  } else {
    switch (noVersionBumpBehavior) {
      case 'current': {
        core.info('No commit resulted in a version bump since last release! Exiting with current as next version...')
        outputVersion(semver.clean(latestTag.name))
        break
      }
      case 'patch': {
        core.info('No commit resulted in a version bump since last release! Defaulting to using PATCH...')
        bump = 'patch'
        break
      }
      case 'silent': {
        core.info('No commit resulted in a version bump since last release! Exiting silently...')
        break
      }
      case 'warn': {
        core.warning('No commit resulted in a version bump since last release!')
        break
      }
      default: {
        core.setFailed('No commit resulted in a version bump since last release!')
        break
      }
    }
  }

  core.setOutput('bump', bump || 'none')
  if (!bump) {
    return
  }

  core.info(`\n>>> Will bump version ${prefix}${latestTag.name} using ${bump.toUpperCase()}\n`)

  // BUMP VERSION

  const next = semver.inc(latestTag.name, bump)

  core.info(`Current version is ${prefix}${latestTag.name}`)
  core.info(`Next version is ${prefix}v${next}`)

  outputVersion(next)
}

main()
