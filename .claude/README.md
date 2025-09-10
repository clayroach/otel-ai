# Claude Code Configuration

This directory contains Claude Code configuration for the project.

## Pre-commit Hooks

The project has automated pre-commit checks configured in `.claude/settings.json` that run when Claude Code attempts to commit:

1. **Format Check** (`pnpm format:check`) - Ensures code follows Prettier formatting standards
2. **TypeScript Check** (`pnpm typecheck:all`) - Validates TypeScript types across the entire project

These hooks:
- Run automatically when Claude Code uses `git commit`
- Block the commit if any check fails
- Are project-specific (work for all developers)
- Only apply to commits made through Claude Code

## For New Developers

When you clone this repository and use Claude Code:
1. The hooks are automatically active (no setup required)
2. Claude will run format and type checks before commits
3. If checks fail, the commit will be blocked with clear error messages

## Manual Commits

Note: These hooks only apply to commits made by Claude Code. If you commit manually from the terminal, consider running:
```bash
pnpm format:check && pnpm typecheck:all
```

## Configuration Details

The hooks are defined in `.claude/settings.json` under the `hooks` section. They use the `PreToolUse` event to intercept Bash commands containing "git commit".