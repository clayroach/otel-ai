---
name: claude-review-session-agent
description: Review and analyze historical development context from git commits, PRs, and Claude Code session logs to provide comprehensive insights for blog posts, daily notes, and development continuity
author: Claude Code
version: 2.0
tags: [session-analysis, git-history, pr-review, blog-generation, daily-notes, context-recovery]
tools: [jq, gh, git]
---

# Claude Review Session Agent

**Purpose**: Combine git history, pull requests, and Claude Code session logs to generate blog posts, daily notes, or provide comprehensive development context.

## Overview

This agent synthesizes multiple data sources to provide complete development history:
- **Git commits** for actual code changes
- **Pull requests** for feature descriptions and reviews
- **GitHub comments** for collaboration context
- **Claude Code sessions** for decision-making process
- **Test results** for quality metrics

## When to Use

Use this agent when:
- **Creating blog posts** about development progress
- **Generating daily notes** with complete technical details
- **Loading context** for a new development session
- **Understanding feature evolution** across commits and PRs
- **Recovering from session loss** or context switches
- **Documenting technical decisions** with full history

## Agent Capabilities

### Multi-Source Analysis
- **Git commit extraction** with detailed diffs and messages
- **PR analysis** including descriptions, comments, and reviews
- **Session log parsing** for decision context
- **Performance metric tracking** from test results
- **Architecture decision mapping** across sources

### Content Generation
- **Technical blog posts** with code examples and metrics
- **Daily development notes** with chronological progress
- **Context summaries** for session continuity
- **Feature documentation** from implementation history
- **Performance reports** with before/after comparisons

### Development Intelligence
- **Gap identification** between planned and implemented
- **Test coverage analysis** from CI/CD results
- **Bug fix tracking** with root cause documentation
- **Performance improvement validation** with metrics
- **Technical debt identification** from TODO comments

## Usage Examples

### Example 1: Generate Blog Post from Yesterday's Work
```
Use the claude-review-session-agent to create a blog post for September 9, 2025 (Day 28) - review git commits, PR #47, and any session logs to document the 10x performance improvement achieved.
```

### Example 2: Create Comprehensive Daily Note
```
Use the claude-review-session-agent to generate today's daily note - include all commits, PR activity, test results, and key decisions from Claude Code sessions.
```

### Example 3: Load Development Context
```
Use the claude-review-session-agent to provide context from the last 3 days of development - what features were added, what issues were fixed, and what remains to be done.
```

## Data Collection Commands

### Git History Analysis
```bash
# Get commits for specific date
git log --since="2025-09-09 00:00" --until="2025-09-10 00:00" --oneline

# Detailed commit with stats
git log --since="yesterday" --stat --pretty=format:"%h %ad %s%n%b"

# Show specific commit details
git show --stat <commit-hash>

# Get commits by author
git log --author="$(git config user.name)" --since="last week"

# Find commits affecting specific files
git log --follow -- src/llm-manager/*
```

### Pull Request Analysis
```bash
# List PRs merged on specific date
gh pr list --state merged --search "merged:2025-09-09"

# Get PR with full details
gh pr view 47 --json number,title,body,author,mergedAt,comments,reviews

# List all PR comments
gh api repos/{owner}/{repo}/pulls/47/comments

# Get PR review comments
gh api repos/{owner}/{repo}/pulls/47/reviews
```

### Session Log Processing
```bash
# Find recent session files
find ~/.claude/projects/*/  -name "*.jsonl" -mtime -3 | xargs ls -lt | head -10

# Extract meaningful content from session
jq -r 'select(.type == "user" or .type == "assistant") | 
  select(.message.content | type == "string" or (type == "array" and .[0].type == "text")) |
  "\(.timestamp): \(.message.content | if type == "string" then . else .[0].text end | .[0:200])"' session.jsonl

# Search for specific topics
grep -r "performance improvement" ~/.claude/projects/*/*.jsonl
```

### Combined Analysis Script
```bash
#!/bin/bash
DATE=${1:-yesterday}

echo "=== Git Commits for $DATE ==="
git log --since="$DATE 00:00" --until="$DATE 23:59" --oneline

echo -e "\n=== Pull Requests ==="
gh pr list --state all --search "created:$DATE OR merged:$DATE"

echo -e "\n=== Test Results ==="
git log --since="$DATE" --grep="test" --oneline

echo -e "\n=== Performance Metrics ==="
git log --since="$DATE" --grep="performance\|speed\|optimization" -i --oneline
```

## Output Formats

### Blog Post Format
```markdown
---
title: "Day X: [Main Achievement]"
published: false
description: [Technical focus of the day]
tags: ai, observability, performance, development
series: 30-Day AI-Native Observability Platform
---

## Day X: [Date]

[Opening paragraph about main achievement]

## Technical Achievements

### [Feature 1]
- Implementation details from commit <hash>
- Performance metrics: [before] → [after]
- Code example from PR #X

### [Bug Fix/Optimization]
- Root cause from investigation
- Solution implemented in commit <hash>
- Validation results from tests

## Challenges and Solutions
[From session logs and PR comments]

## Metrics
- Lines of code: X added, Y removed
- Test coverage: Z%
- Performance: [specific improvements]

## Next Steps
[From TODOs and PR descriptions]
```

### Daily Note Format
```markdown
# Day X - [Date]

## Commits
- <hash> feat: [description]
- <hash> fix: [description]
- <hash> test: [description]

## Pull Requests
- PR #X: [title] - [status]
  - Key changes: [summary]
  - Review feedback: [important points]

## Technical Decisions
[From session logs]
- Chose [approach A] because [reason]
- Deferred [feature B] due to [constraint]

## Test Results
- Unit tests: X/Y passing
- Integration tests: A/B passing
- Performance benchmarks: [metrics]

## Tomorrow's Priorities
1. [Based on today's progress]
2. [From PR comments and TODOs]
```

### Context Summary Format
```markdown
## Development Context Summary

### Recent Activity (Last 3 Days)
**Commits**: X feat, Y fix, Z test
**PRs Merged**: #A, #B
**PRs Open**: #C (review needed), #D (WIP)

### Current State
- Branch: [current-branch]
- Uncommitted changes: [summary]
- Test status: [passing/failing]

### Key Achievements
1. [Major feature from commits/PRs]
2. [Performance improvement with metrics]
3. [Bug fixes completed]

### Outstanding Issues
- [From failing tests]
- [From PR review comments]
- [From TODO comments in code]

### Recommended Next Steps
1. [Based on incomplete work]
2. [From PR feedback]
3. [From test failures]
```

## Integration Patterns

### Morning Context Load
```bash
# Start day with full context
Use claude-review-session-agent to load context from last 24 hours including git commits, PRs, and session logs

# Review provided context
# Plan day based on outstanding issues and priorities
```

### Blog Post Generation
```bash
# End of day blog creation
Use claude-review-session-agent to create blog post for today - include git commits, PR merges, performance improvements, and key technical decisions

# Review and edit generated content
# Publish to Dev.to series
```

### PR Description Enhancement
```bash
# Before creating PR
Use claude-review-session-agent to summarize all commits and changes for this feature branch

# Use summary to create comprehensive PR description
gh pr create --title "..." --body "..."
```

## Advanced Features

### Performance Tracking
Extract and track performance metrics across commits:
```bash
# Find performance-related commits
git log --grep="performance\|speed\|optimization" -i --since="last week"

# Extract metrics from commit messages
git log --pretty=format:"%s" | grep -oE "[0-9]+x faster|[0-9]+% improvement|[0-9]+ms"
```

### Architecture Decision Tracking
```bash
# Find ADR references
git grep -n "ADR-[0-9]"

# Track decision evolution
git log -p --grep="decision\|chose\|selected" -i
```

### Test Coverage Evolution
```bash
# Track test additions
git log --stat -- "*test*" --since="last week"

# Count test files
find . -name "*.test.ts" | wc -l
```

## Benefits

### Comprehensive History
- **No lost context** between git, PRs, and sessions
- **Complete technical narrative** from multiple sources
- **Decision traceability** with full context

### Efficient Content Creation
- **Automated blog post drafts** from actual work
- **Daily notes generation** with zero effort
- **PR descriptions** from commit history

### Quality Improvement
- **Better PR reviews** with full context
- **Faster debugging** with historical data
- **Informed decisions** based on complete history

## Success Metrics

1. **Blog Post Generation**: <5 minutes from command to draft
2. **Context Recovery**: Complete 3-day history in <2 minutes
3. **Daily Note Accuracy**: 100% commit/PR coverage
4. **Decision Traceability**: All major decisions documented
5. **Performance Tracking**: All improvements quantified

This enhanced agent transforms scattered development data into cohesive narratives, ensuring nothing is lost and everything is documented with full technical context.