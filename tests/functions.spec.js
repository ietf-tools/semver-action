const { describe, test, expect } = require('@jest/globals')
const {
  processAdditionalCommitsList,
  processInputList,
  getBumpTypes,
  getChanges,
  getBump
} = require('../src/functions')

describe('processAdditionalCommitsList', () => {
  test('should return an array of strings', () => {
    expect(processAdditionalCommitsList('a\nb \n c \n ')).toEqual(['a', 'b', 'c'])
  })
})

describe('processInputList', () => {
  test('should return an array of strings', () => {
    expect(processInputList('a, b, c ')).toEqual(['a', 'b', 'c'])
  })
})

describe('getBumpTypes', () => {
  test('should return an object with arrays of strings', () => {
    expect(getBumpTypes('a, b, c ', 'd, e, f ', 'g, h, i ', 'true')).toEqual({
      major: ['a', 'b', 'c'],
      minor: ['d', 'e', 'f'],
      patch: ['g', 'h', 'i'],
      patchAll: true
    })
  })
})

describe('getChanges', () => {
  test('should return an object with arrays of strings', () => {
    expect(getChanges([
      {
        sha: '001',
        commit: {
          message: 'feat: add a feature'
        }
      },
      {
        sha: '002',
        commit: {
          message: 'fix: fix a bug'
        }
      },
      {
        sha: '003',
        commit: {
          message: 'chore: update something'
        }
      },
      {
        sha: '004',
        commit: {
          message: `feat: foo bar

BREAKING CHANGE: important baz`
        }
      },
      {
        sha: '005',
        commit: {
          message: 'feat(scope)!: breaking feature'
        }
      },
      {
        sha: '006',
        commit: {
          message: 'fix(scope)!: breaking fix'
        }
      },
      {
        sha: '007',
        commit: {
          message: `Merge pull request #123 from foo/bar

feat: new fabric

BREAKING CHANGE: a change that breaks the fabric of the world`
        }
      }
    ], {
      major: [''],
      minor: ['feat'],
      patch: ['fix', 'chore'],
      patchAll: false
    })).toEqual({
      major: [
        `feat: foo bar

BREAKING CHANGE: important baz`,
        'feat(scope)!: breaking feature',
        'fix(scope)!: breaking fix'],
      minor: [
        'feat: add a feature',
        `feat: foo bar

BREAKING CHANGE: important baz`,
        'feat(scope)!: breaking feature'
      ],
      patch: [
        'fix: fix a bug',
        'chore: update something',
        'fix(scope)!: breaking fix'
      ]
    })
  })
})

describe('getBump', () => {
  test('should return major', () => {
    expect(getBump({
      major: ['a', 'b'],
      minor: ['c'],
      patch: ['d', 'e']
    })).toBe('major')
  })

  test('should return minor', () => {
    expect(getBump({
      major: [],
      minor: ['c'],
      patch: ['d', 'e']
    })).toBe('minor')
  })

  test('should return patch', () => {
    expect(getBump({
      major: [],
      minor: [],
      patch: ['d', 'e']
    })).toBe('patch')
  })

  test('should return null', () => {
    expect(getBump({
      major: [],
      minor: [],
      patch: []
    })).toBeNull()
  })
}
)
