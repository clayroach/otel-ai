# Daily Notes - Claude Context

## Overview
Daily development journals for tracking progress, goals, and technical decisions. This directory contains personal development notes that remain in Dendron format (not migrated to GitHub Issues).
This file is automatically read by Claude Code when working with daily notes.

## Daily Note Format

### Standard Structure
```markdown
# Daily Development Journal - YYYY.MM.DD

## Today's Focus: [Main Theme or Challenge]

### Current Context
- **Yesterday's Achievements**: [What was completed]
- **Current Challenge**: [What problem/task is being tackled]
- **Project Timeline**: [Where we are in the 30-day challenge]

### Today's Primary Goals

#### 🎯 Goal 1: [Specific, Measurable Goal]
**Status**: 🔄 In Progress | ✅ Complete | ❌ Blocked
**Success Metrics**:
- [ ] Concrete deliverable 1
- [ ] Concrete deliverable 2
- [ ] Measurable outcome

**Implementation Plan**:
1. Step-by-step approach
2. Technical details
3. Validation criteria

#### 🎯 Goal 2: [Another Specific Goal]
[Same structure as Goal 1]

### Technical Notes
[Any important technical discoveries, decisions, or learnings]

### Blockers & Issues
- **Blocker**: [Description and proposed solution]
- **Issue**: [Problem encountered and resolution]

### Tomorrow's Priorities
1. [Next priority based on today's progress]
2. [Follow-up items]

### Session Summary
- **Hours Worked**: [Actual focused development time]
- **Key Achievements**: [Bullet points of completed items]
- **Decisions Made**: [Important technical or architectural decisions]
```

## Session Context Recovery

When starting a new Claude session, automatically review:

### Priority 1 (ESSENTIAL - Must Execute)
1. **Recent Daily Notes** - Last 2-3 entries for progress trajectory
   ```bash
   ls -la notes/daily/ | tail -5
   # Then read the most recent notes
   ```

2. **Git History** - Recent development activity
   ```bash
   git log --oneline -10
   git status
   git branch --show-current
   ```

3. **GitHub Issues** - Active work items
   ```
   mcp__github__list_issues with state:OPEN and (label:priority:critical OR label:status:in-progress)
   ```

### Priority 2 (IMPORTANT)
4. **Package CLAUDE.md** - Current package contexts
5. **Recent PRs** - What was merged recently
   ```bash
   gh pr list --state merged --limit 5
   ```

### Priority 3 (CONTEXTUAL)
6. **Feature Documents** - Active feature work in `notes/design/features/`
7. **ADRs** - Architecture decisions in GitHub Issues with `type:adr` label

## Goal Setting Guidelines

### SMART Goals
- **Specific**: Clear, concrete deliverables
- **Measurable**: Defined success metrics
- **Achievable**: 2-4 goals per 4-hour session
- **Relevant**: Aligned with project timeline
- **Time-bound**: Completable in one session

### Goal Categories
1. **Implementation**: New feature development
2. **Refactoring**: Code quality improvements
3. **Testing**: Test coverage and validation
4. **Documentation**: Specs, ADRs, or README updates
5. **Infrastructure**: Build, deploy, or tooling

## Context Gathering Process

### Before Creating Daily Note
1. **Check Uncommitted Work**
   ```bash
   git status --short
   git diff --stat
   ```

2. **Review Yesterday's Goals**
   - Read previous daily note
   - Check completion status
   - Identify carry-over items

3. **Assess Project State**
   - Current milestone progress
   - Timeline positioning
   - Critical path items

### Creating the Daily Note
1. **Use Write Tool** - Actually create the file, don't just plan to
2. **Include Context** - Yesterday's achievements and today's challenges
3. **Set 2-4 Goals** - Concrete, achievable in 4-hour session
4. **Define Metrics** - Clear success criteria for each goal
5. **Plan Implementation** - Step-by-step approach

## Common Patterns

### Successful Session Pattern
- Start with context recovery (5-10 minutes)
- Set clear, focused goals
- Work on highest-impact items first
- Document decisions and blockers
- End with progress summary

### Anti-Patterns to Avoid
- ❌ Setting too many goals (>4)
- ❌ Vague or unmeasurable objectives
- ❌ Ignoring previous session context
- ❌ Not documenting blockers
- ❌ Missing success metrics

## Integration with GitHub Issues

While daily notes remain in Dendron:
- **Features** → Create GitHub issue with `type:feature` label
- **Bugs** → Create GitHub issue with `type:bug` label
- **ADRs** → Create GitHub issue with `type:adr` label
- **Personal Notes** → Keep in daily journal

## File Naming Convention
- Format: `YYYY.MM.DD.md`
- Example: `2025.09.23.md`
- Location: `notes/daily/`

## Quick Commands
```bash
# Check recent daily notes
ls -la notes/daily/ | tail -10

# Create today's note
echo "# Daily Development Journal - $(date +%Y.%m.%d)" > notes/daily/$(date +%Y.%m.%d).md

# Find notes with specific content
grep -r "Goal" notes/daily/ | tail -10

# Check GitHub issues for today's work
mcp__github__list_issues query:"is:open assignee:@me"
```