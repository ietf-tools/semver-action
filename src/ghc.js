const github = require('@actions/github')
const core = require('@actions/core')
const _ = require('lodash')
const semver = require('semver')

const { outputVersion } = require('./functions')

class GHClient {
  constructor (token) {
    this.gh = github.getOctokit(token)
    this.owner = github.context.repo.owner
    this.repo = github.context.repo.repo
  }

  async fetchLastTags (fetchLimit) {
    return await this.gh.graphql(`
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
      owner: this.owner,
      repo: this.repo,
      fetchLimit
    })
  }

  async fetchSingleTag (prefix, fromTag) {
    return await this.gh.graphql(`
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
      owner: this.owner,
      repo: this.repo,
      tag: `refs/tags/${prefix}${fromTag}`
    })
  }

  async compareCommitsWithBasehead (prefix, tagName, branch, page) {
    return await this.gh.rest.repos.compareCommitsWithBasehead({
      owner: this.owner,
      repo: this.repo,
      basehead: `${prefix}${tagName}...${branch}`,
      page,
      per_page: 100
    })
  }

  /**
   * Fetches the latest tag from the repository
   */
  async getLatestTag (fetchLimit, prefix, fallbackTag, skipInvalidTags) {
    let latestTag = null

    const tagsRaw = await this.fetchLastTags(fetchLimit)

    const tagsList = _.get(tagsRaw, 'repository.refs.nodes', [])
    if (tagsList.length < 1) {
      if (fallbackTag && semver.valid(fallbackTag)) {
        core.info(`Using fallback tag: ${fallbackTag}`)
        latestTag = { name: fallbackTag }
      } else {
        return core.setFailed('Couldn\'t find the latest tag. Make sure you have at least one tag created or provide a fallbackTag!')
      }
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

    return latestTag
  }

  /**
   * Fetches a specific tag from the repository
   */
  async getSpecificTag (prefix, fromTag) {
    let specificTag = null

    const tagRaw = await this.fetchSingleTag(prefix, fromTag)
    specificTag = _.get(tagRaw, 'repository.ref')

    if (!specificTag) {
      return core.setFailed('Provided tag could not be found!')
    }

    if (prefix && specificTag.name.indexOf(prefix) === 0) {
      specificTag.name = specificTag.name.replace(prefix, '')
    }

    if (!semver.valid(specificTag.name)) {
      return core.setFailed('Provided tag is invalid! (does not conform to semver)')
    }

    return specificTag
  }

  /**
   * Fetches commits between the branch HEAD and the given tag
   */
  async getCommits (branch, tag, prefix, additionalCommits, noNewCommitBehavior) {
    let curPage = 0
    let totalCommits = 0
    let hasMoreCommits = false
    const commits = []

    do {
      hasMoreCommits = false
      curPage++
      const commitsRaw = await this.compareCommitsWithBasehead(prefix, tag.name, branch, curPage)
      totalCommits = _.get(commitsRaw, 'data.total_commits', 0)
      const rangeCommits = _.get(commitsRaw, 'data.commits', [])
      commits.push(...rangeCommits)
      if ((curPage - 1) * 100 + rangeCommits.length < totalCommits) {
        hasMoreCommits = true
      }
    } while (hasMoreCommits)

    if (additionalCommits && additionalCommits.length > 0) {
      commits.push(...additionalCommits)
    }

    if (!commits || commits.length < 1) {
      switch (noNewCommitBehavior) {
        case 'current': {
          core.info('Couldn\'t find any commits between branch HEAD and latest tag. Exiting with current as next version...')
          outputVersion(semver.clean(tag.name))
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
  }
}

module.exports = GHClient
