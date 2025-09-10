# Claude Code Hooks Configuration

This project uses Claude Code hooks to ensure code quality before commits.

## Pre-commit Hook

When Claude attempts to commit code using `git commit`, the following checks automatically run:

1. **Format Check** (`pnpm format:check`) - Ensures code follows Prettier formatting standards
2. **TypeScript Check** (`pnpm typecheck:all`) - Validates TypeScript types across the entire project
3. **Lint Check** (included in typecheck:all) - Runs ESLint to catch code quality issues

## How It Works

The hook is configured in `~/.claude/settings.json` and:
- Only runs when Claude uses the Bash tool to commit
- Blocks the commit if any check fails
- Provides clear feedback about what failed

## Note

This hook only applies to commits made by Claude Code. Manual commits from your terminal won't trigger these checks.