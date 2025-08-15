#!/bin/bash

# Claude Code Prompt-Driven PR Creation Workflow
# This script provides a prompt template for creating PRs with proper screenshot organization

echo "🚀 Starting Claude Code PR Creation Workflow..."
echo ""
echo "Copy and paste this prompt into Claude Code:"
echo ""
echo "==================== CLAUDE CODE PROMPT ===================="
echo ""
cat << 'EOF'
I'm ready to create a comprehensive PR for my recent development work. Please help me with the following workflow:

## 1. Screenshot Organization
- Check the `screenshots-dropbox/` folder for any screenshots I've added
- Analyze the screenshots to determine:
  - Which package they relate to (ui, storage, ai-analyzer, etc.)
  - What features they demonstrate
  - Appropriate file naming conventions
- Move them to the correct `notes/packages/[package]/screenshots/YYYY-MM-DD-feature-name/` structure
- Update the screenshot README files with proper descriptions

## 2. Package Documentation Updates
- Review recent code changes across all packages
- Update the relevant `notes/packages/[package]/package.md` files to reflect:
  - New features implemented
  - Architecture changes
  - UI improvements
  - API modifications
- Ensure documentation matches the current implementation
- Add references to the organized screenshots

## 3. Design Documentation
- Update `notes/design.md` with any architectural decisions made
- Document the dual ingestion pattern if applicable
- Record any significant design trade-offs or improvements

## 4. PR Creation
- Generate a comprehensive PR title and description
- Include:
  - Feature overview with hero screenshot
  - Technical changes summary
  - Before/after comparisons where applicable
  - Testing instructions
  - Documentation updates
  - References to updated package docs
- Format for GitHub PR template

## 5. Blog Entry Preparation
- Identify if this work warrants a blog post
- If yes, create/update the appropriate daily journal entry
- Prepare blog post outline with:
  - Hero image from screenshots
  - Technical explanation
  - Code examples
  - Visual demonstrations
  - Links to PR and documentation

## Context
- Project: AI-native observability platform (30-day challenge)
- Current branch: [I'll tell you the branch name]
- Recent work focus: [I'll describe what I've been working on]

Please start by scanning the screenshots-dropbox folder and suggesting the organization structure, then proceed through each step systematically.
EOF

echo ""
echo "==================== END PROMPT ===================="
echo ""
echo "After running this prompt:"
echo "1. Claude will organize your screenshots automatically"
echo "2. Update all package documentation to match current code"
echo "3. Generate a comprehensive PR with proper visual documentation"
echo "4. Prepare blog content with organized screenshots"
echo ""
echo "✨ This replaces complex bash scripting with flexible AI-driven workflows!"