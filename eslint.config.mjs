// @ts-check
import eslint from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import globals from 'globals'

export default [
  eslint.configs.recommended,
  {
    ignores: [
      'dist/**/*',
      'node_modules/**/*',
      'src/opentelemetry/**/*',
      'vitest.config.ts',
      'demo/**/*',
      'scripts/**/*',
      'ui/public/**/*',
      '**/*.min.js',
      '**/bundle*',
      '**/vendor/**',
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/test/**',
      'ui/vite.config.ts',
      'ui/*.js'
    ]
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'ui/src/**/*.ts', 'ui/src/**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2021
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'allow-as-parameter'
        }
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      'no-undef': 'off' // TypeScript handles this
    }
  },
  {
    files: ['src/server.ts', 'src/llm-manager/interaction-logger.ts'],
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  },
  {
    files: ['ui/**/*'],
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'warn'
    }
  }
]
