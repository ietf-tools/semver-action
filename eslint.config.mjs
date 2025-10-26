import js from '@eslint/js'
import neostandard from 'neostandard'

export default [
  js.configs.recommended,
  ...neostandard(),
  {
    ignores: [
      '/dist',
      '/node_modules'
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
    }
  }
]
