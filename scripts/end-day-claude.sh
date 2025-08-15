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

# Launch Claude Code with comprehensive end-of-day prompt
claude-code --prompt="I'm ready to complete Day $DAY_NUM of the AI-native observability platform.

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
Generate a comprehensive Dev.to blog post covering:
- Today's accomplishments with technical depth
- Code examples and architectural insights
- Challenges and solutions narrative
- Progress metrics and momentum assessment

## 4. **Claude Code Session Integration**
Help me:
- Document key decisions and discoveries from our session
- Reference important technical discussions
- Update daily note with session outcomes

## 5. **Tomorrow's Planning Foundation**
Based on today's progress:
- Suggest priority areas for tomorrow
- Identify any blockers to address
- Update project timeline if needed

## Current Context:
- Day $DAY_NUM of 30-day challenge ($(( DAY_NUM * 100 / 30 ))% complete)  
- Daily note: notes/daily/$DATE.md
- Focus: UI-first development approach for faster iteration

Let's start with reviewing today's progress. What did I actually accomplish vs. what was planned?"