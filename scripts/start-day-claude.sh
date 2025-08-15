#!/bin/bash

# Get current day number from git log or increment manually
DAY_NUM=${1:-$(( $(find notes/daily -name "*.md" | wc -l) + 1 ))}

echo "🌅 Starting Day $DAY_NUM - AI-Native Observability Platform"
echo "============================================================"
echo ""
echo "Launching Claude Code with daily planning template..."
echo ""

# Launch Claude Code with structured prompt
claude-code --prompt="I'm ready to start Day $DAY_NUM of the AI-native observability platform.

Please help me with daily planning:

1. **Review Yesterday's Progress**: Look at the latest daily note in notes/daily/ and help me assess what was completed vs planned

2. **Capture New Insights**: I'll share any new thoughts or architectural insights since yesterday

3. **Plan Today's Goals**: Based on progress and project priorities, help me set 2-4 focused goals for today

4. **Update Documentation**: Create today's daily note in notes/daily/ with the planned goals

5. **Set Context**: Provide a summary of where we are in the 30-day timeline and key focus areas

Let's start with reviewing yesterday's progress. What should I focus on today?"