const core = require('@actions/core')
const semver = require('semver')
const cc = require('@conventional-commits/parser')

const outputVersion = (prefix, version) => {
  core.exportVariable('next', `${prefix}v${version}`)
  core.exportVariable('nextStrict', `${prefix}${version}`)

  core.setOutput('next', `${prefix}v${version}`)
  core.setOutput('nextStrict', `${prefix}${version}`)
  core.setOutput('nextMajor', `${prefix}v${semver.major(version)}`)
  core.setOutput('nextMajorStrict', `${prefix}${semver.major(version)}`)
}

const processAdditionalCommitsList = (input) => {
  return input.split('\n').map(l => l.trim()).filter(l => l !== '')
}

const processInputList = (input) => {
  return input.split(',').map(p => p.trim()).filter(p => p)
}

const getBumpTypes = (majorListStr, minorListStr, patchListStr, patchAll) => {
  return {
    major: processInputList(majorListStr),
    minor: processInputList(minorListStr),
    patch: processInputList(patchListStr),
    patchAll: (patchAll === true || patchAll === 'true')
  }
}

const getChanges = (commits, bumpTypes) => {
  const changes = {
    major: [],
    minor: [],
    patch: []
  }

  for (const commit of commits) {
    try {
      const cAst = cc.toConventionalChangelogFormat(cc.parser(commit.commit.message))

      if (bumpTypes.major.includes(cAst.type)) {
        changes.major.push(commit.commit.message)
        core.info(`[MAJOR] Commit ${commit.sha} of type ${cAst.type} will cause a major version bump.`)
      } else if (bumpTypes.minor.includes(cAst.type)) {
        changes.minor.push(commit.commit.message)
        core.info(`[MINOR] Commit ${commit.sha} of type ${cAst.type} will cause a minor version bump.`)
      } else if (bumpTypes.patchAll || bumpTypes.patch.includes(cAst.type)) {
        changes.patch.push(commit.commit.message)
        core.info(`[PATCH] Commit ${commit.sha} of type ${cAst.type} will cause a patch version bump.`)
      } else {
        core.info(`[SKIP] Commit ${commit.sha} of type ${cAst.type} will not cause any version bump.`)
      }

      for (const note of cAst.notes) {
        if (note.title === 'BREAKING CHANGE') {
          changes.major.push(commit.commit.message)
          core.info(`[MAJOR] Commit ${commit.sha} has a BREAKING CHANGE mention, causing a major version bump.`)
        }
      }
    } catch (err) {
      core.info(`[INVALID] Skipping commit ${commit.sha} as it doesn't follow conventional commit format.`)
    }
  }

  return changes
}

const getBump = (changes) => {
  let bump = null
  if (changes.major.length > 0) {
    bump = 'major'
  } else if (changes.minor.length > 0) {
    bump = 'minor'
  } else if (changes.patch.length > 0) {
    bump = 'patch'
  }
  return bump
}

module.exports = {
  outputVersion,
  processAdditionalCommitsList,
  processInputList,
  getBumpTypes,
  getChanges,
  getBump
}
