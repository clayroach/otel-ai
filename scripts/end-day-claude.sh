#!/bin/bash

# Get current day number and date
DATE=${1:-$(date +%Y.%m.%d)}
DAY_NUM=$(( $(echo $DATE | cut -d. -f3 | sed 's/^0*//') - 12 ))
if [ $DAY_NUM -lt 1 ]; then DAY_NUM=1; fi

echo "🌙 End of Day $DAY_NUM - AI-Native Observability Platform"
echo "=========================================================="
echo ""
echo "Launching Claude Code with daily review and blog generation template..."
echo ""

# Display prompt for copy/paste into Claude Code
echo "📋 Copy and paste this prompt into Claude Code:"
echo "================================================"
echo ""
echo "I'm ready to complete Day $DAY_NUM of the AI-native observability platform.

Let's conduct a comprehensive end-of-day review and generate content:

## 1. **Progress Review** 
Review today's daily note at notes/daily/$DATE.md and help me:
- Mark completion status for each goal (completed/partial/not started)
- Capture unexpected accomplishments beyond planned goals
- Document key technical highlights and implementations

## 2. **Reflection & Learning Capture**
Help me articulate:
- Key insights and learnings from today's work
- Technical challenges encountered and how they were solved
- Process improvements or architectural decisions made

## 3. **Blog Content Generation**
Generate a comprehensive Dev.to blog post in blog/platforms/dev-to-YYYY-MM-DD.md covering:
- Today's accomplishments with technical depth
- Code examples and architectural insights
- Challenges and solutions narrative
- Progress metrics and momentum assessment
- Proper Dev.to frontmatter with series and tags
- Reference to screenshots in screenshots-dropbox/ for upload

## 4. **Documentation Sync & Integration**
Help me:
- Document key decisions and discoveries from our session
- Reference important technical discussions
- Update daily note with session outcomes
- Organize any screenshots from screenshots-dropbox/ into package documentation
- Update README.md progress section with current milestone achievements
- Ensure all documentation derives from daily notes rather than duplicating content

## 5. **Tomorrow's Planning Foundation**
Based on today's progress:
- Suggest priority areas for tomorrow
- Identify any blockers to address
- Update project timeline if needed

## 6. **Version Control & Tagging**
After session completion:
- Create git tag for day milestone: git tag -a 'day-$DAY_NUM' -m 'Day $DAY_NUM: [brief summary of key achievement]'
- Push tag: git push origin day-$DAY_NUM
- This enables easy backtracking to any day's state

## Current Context:
- Day $DAY_NUM of 30-day challenge ($(( DAY_NUM * 100 / 30 ))% complete)  
- Daily note: notes/daily/$DATE.md
- Focus: UI-first development approach for faster iteration

Let's start with reviewing today's progress. What did I actually accomplish vs. what was planned?"

echo ""
echo "================================================"