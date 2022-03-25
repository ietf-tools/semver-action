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

  const bumpTypes = {
    major: core.getInput('major-list').split(','),
    minor: core.getInput('minor-list').split(','),
    patch: core.getInput('patch-list').split(','),
    patchAll: (core.getInput('patch-all') === true || core.getInput('patch-all') === 'true'),
  }

  // GET LATEST + PREVIOUS TAGS

  const tagsRaw = await gh.graphql(`
    query lastTags ($owner: String!, $repo: String!) {
      repository (owner: $owner, name: $repo) {
        refs(first: 1, refPrefix: "refs/tags/", orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) {
          nodes {
            name
            target {
              oid
            }
          }
        }
      }
    }
  `, {
    owner,
    repo
  })

  const latestTag = _.get(tagsRaw, 'repository.refs.nodes[0]')

  if (!latestTag) {
    return core.setFailed('Couldn\'t find the latest tag. Make sure you have at least one tag created first.')
  }

  core.info(`Comparing against latest tag: ${latestTag.name}`)

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
      basehead: `${latestTag.name}...${branch}`,
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

  if (!commits || commits.length < 1) {
    return core.setFailed('Couldn\'t find any commits between HEAD and latest tag.')
  }

  // PARSE COMMITS

  let majorChanges = []
  let minorChanges = []
  let patchChanges = []
  for (const commit of commits) {
    try {
      const cAst = cc.toConventionalChangelogFormat(cc.parser(commit.commit.message))
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
    return core.setFailed('No commit resulted in a version bump since last release!')
  }
  core.info(`\n>>> Will bump version ${latestTag.name} using ${bump.toUpperCase()}\n`)

  // BUMP VERSION

  const next = semver.inc(latestTag.name, bump)

  core.info(`Current version is ${latestTag.name}`)
  core.info(`Next version is v${next}`)

  core.exportVariable('current', latestTag.name)
  core.exportVariable('next', `v${next}`)
  core.exportVariable('nextStrict', next)
}

main()
