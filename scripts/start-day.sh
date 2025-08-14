#!/bin/bash
# Interactive start of day workflow

DATE=$(date +%Y.%m.%d)
DAY_NUMBER=$(( $(date +%d) - 12 )) # Assuming started on 13th
if [ $DAY_NUMBER -lt 1 ]; then
    DAY_NUMBER=1
fi

echo "🌅 Starting Day $DAY_NUMBER - AI-Native Observability Platform"
echo "============================================================"
echo ""

# Check if yesterday's note exists
YESTERDAY=$(date -j -v-1d +%Y.%m.%d 2>/dev/null || date -d "yesterday" +%Y.%m.%d 2>/dev/null)
YESTERDAY_NOTE="notes/daily/$YESTERDAY.md"

if [ -f "$YESTERDAY_NOTE" ]; then
    echo "📋 Let's review yesterday's progress first..."
    echo ""
    
    # Extract yesterday's goals
    echo "Yesterday's Goals:"
    grep "^- \[.\]" "$YESTERDAY_NOTE" | head -10
    echo ""
    
    # Interactive review of each goal
    echo "Please review each goal from yesterday:"
    echo "For each item, enter: c (completed), p (partial), n (not started), s (skip/not relevant)"
    echo ""
    
    GOALS_COMPLETED=""
    GOALS_PARTIAL=""
    GOALS_NOT_STARTED=""
    
    while IFS= read -r goal; do
        if [[ $goal =~ ^-\ \[(.*)\]\ (.*)$ ]]; then
            status="${BASH_REMATCH[1]}"
            task="${BASH_REMATCH[2]}"
            
            echo "Goal: $task"
            echo -n "Status (c/p/n/s): "
            read response
            
            case $response in
                c|C)
                    GOALS_COMPLETED="$GOALS_COMPLETED- ✅ $task\n"
                    echo "✅ Marked as completed"
                    ;;
                p|P)
                    echo -n "What percentage complete? (0-100): "
                    read percentage
                    echo -n "What's remaining? "
                    read remaining
                    GOALS_PARTIAL="$GOALS_PARTIAL- 🔄 $task ($percentage% complete - remaining: $remaining)\n"
                    echo "🔄 Marked as partial"
                    ;;
                n|N)
                    echo -n "Why wasn't this started? "
                    read reason
                    GOALS_NOT_STARTED="$GOALS_NOT_STARTED- ❌ $task (reason: $reason)\n"
                    echo "❌ Marked as not started"
                    ;;
                s|S)
                    echo "⏭️  Skipped"
                    ;;
                *)
                    echo "❓ Invalid response, skipping..."
                    ;;
            esac
            echo ""
        fi
    done < <(grep "^- \[.\]" "$YESTERDAY_NOTE" | head -10)
fi

echo ""
echo "💭 Additional Thoughts & Insights"
echo "================================="
echo "Have you had any new thoughts about the project since yesterday?"
echo "Consider: architecture changes, new ideas, concerns, optimizations, etc."
echo ""
echo "Enter your thoughts (press Enter twice when done):"

ADDITIONAL_THOUGHTS=""
while IFS= read -r line; do
    if [[ -z "$line" ]]; then
        break
    fi
    ADDITIONAL_THOUGHTS="$ADDITIONAL_THOUGHTS$line\n"
done

echo ""
echo "🎯 Today's Goal Planning"
echo "======================="
echo "Based on yesterday's progress analysis, here are suggested goals for today:"
echo ""

# Generate intelligent goal suggestions based on progress
SUGGESTED_GOALS=""

# Add carryover goals from partial/not started items
if [ ! -z "$GOALS_PARTIAL" ]; then
    echo "📋 Suggested goals from partially completed items:"
    while IFS= read -r line; do
        if [[ $line =~ 🔄.*\((.*)\%.*remaining:\ (.*)\) ]]; then
            task_name=$(echo "$line" | sed 's/^- 🔄 //' | sed 's/ ([^)]*)$//')
            remaining="${BASH_REMATCH[2]}"
            SUGGESTED_GOALS="$SUGGESTED_GOALS- [ ] Complete: $task_name - Focus: $remaining\n"
            echo "  → Complete: $task_name - Focus: $remaining"
        fi
    done <<< "$(echo -e "$GOALS_PARTIAL")"
    echo ""
fi

if [ ! -z "$GOALS_NOT_STARTED" ]; then
    echo "📋 Suggested goals from unstarted items:"
    while IFS= read -r line; do
        if [[ $line =~ 🔄.*❌\ (.*?)\ \(reason: ]]; then
            task_name=$(echo "$line" | sed 's/^- ❌ //' | sed 's/ (reason:.*)$//')
            SUGGESTED_GOALS="$SUGGESTED_GOALS- [ ] Start: $task_name\n"
            echo "  → Start: $task_name"
        fi
    done <<< "$(echo -e "$GOALS_NOT_STARTED")"
    echo ""
fi

# Add logical next steps based on completed work and additional thoughts
if [[ "$ADDITIONAL_THOUGHTS" =~ [Ee]ffect.*[Tt][Ss].*complicat ]]; then
    SUGGESTED_GOALS="$SUGGESTED_GOALS- [ ] Simplify Effect-TS usage or create readable wrapper patterns\n"
    echo "📋 Based on your thoughts about Effect-TS complexity:"
    echo "  → Simplify Effect-TS usage or create readable wrapper patterns"
fi

if [[ "$ADDITIONAL_THOUGHTS" =~ [Dd]eveloper.*setup.*easy ]]; then
    SUGGESTED_GOALS="$SUGGESTED_GOALS- [ ] Create developer-friendly setup documentation and scripts\n"
    echo "📋 Based on your thoughts about easy developer setup:"
    echo "  → Create developer-friendly setup documentation and scripts"
fi

# Add progression goals based on project phase
echo "📋 Suggested progression goals for Day $DAY_NUMBER:"
if [ $DAY_NUMBER -le 7 ]; then
    echo "  → Week 1 Focus: Foundation and core infrastructure"
    SUGGESTED_GOALS="$SUGGESTED_GOALS- [ ] Set up development environment (GitHub, Docker Compose)\n"
    SUGGESTED_GOALS="$SUGGESTED_GOALS- [ ] Generate and test core storage package code\n"
    SUGGESTED_GOALS="$SUGGESTED_GOALS- [ ] Validate OTel Demo integration works end-to-end\n"
elif [ $DAY_NUMBER -le 14 ]; then
    echo "  → Week 2 Focus: AI integration"
    SUGGESTED_GOALS="$SUGGESTED_GOALS- [ ] Implement autoencoder anomaly detection\n"
    SUGGESTED_GOALS="$SUGGESTED_GOALS- [ ] Set up LLM manager with basic routing\n"
elif [ $DAY_NUMBER -le 21 ]; then
    echo "  → Week 3 Focus: Dynamic UI"
    SUGGESTED_GOALS="$SUGGESTED_GOALS- [ ] Build React component generation system\n"
    SUGGESTED_GOALS="$SUGGESTED_GOALS- [ ] Create role-based dashboard templates\n"
else
    echo "  → Week 4 Focus: Self-healing and completion"
    SUGGESTED_GOALS="$SUGGESTED_GOALS- [ ] Implement configuration management\n"
    SUGGESTED_GOALS="$SUGGESTED_GOALS- [ ] Complete end-to-end testing\n"
fi

echo ""
echo "📝 Here are the suggested goals:"
echo ""

# Number the goals for easy reference
goal_num=1
while IFS= read -r suggested_goal; do
    if [[ $suggested_goal =~ ^-\ \[\ \]\ (.*)$ ]]; then
        goal_text="${BASH_REMATCH[1]}"
        echo "$goal_num. $goal_text"
        ((goal_num++))
    fi
done <<< "$(echo -e "$SUGGESTED_GOALS")"

echo ""
echo "Review these goals. You can:"
echo "- Accept all goals as-is by pressing Enter"
echo "- Describe changes in natural language"
echo ""
echo "Examples:"
echo "  'Remove goal 2 and modify goal 3 to focus on basic setup only'"
echo "  'Keep goals 1-3, remove goal 4, add new goal about documentation'"
echo "  'Change goal 2 to be about Docker setup instead'"
echo ""
echo -n "Enter your modifications (or press Enter to accept all): "
read modifications

if [[ -z "$modifications" ]]; then
    # Accept all suggested goals
    TODAY_GOALS="$SUGGESTED_GOALS"
    echo "✅ Accepted all suggested goals"
else
    echo ""
    echo "You want to: $modifications"
    echo ""
    echo "Based on your description, please manually edit the goals below."
    echo "Current suggested goals are:"
    echo -e "$SUGGESTED_GOALS"
    echo ""
    echo "Enter your final goals (press Enter twice when done):"
    
    TODAY_GOALS=""
    while IFS= read -r line; do
        if [[ -z "$line" ]]; then
            break
        fi
        TODAY_GOALS="$TODAY_GOALS- [ ] $line\n"
    done
fi

echo ""
echo "📦 Package Focus"
echo "==============="
echo "Which packages will you primarily work on today?"
echo "Available: storage, ai-analyzer, llm-manager, ui-generator, config-manager, deployment"
echo "Enter package names (press Enter twice when done):"

TODAY_PACKAGES=""
while IFS= read -r line; do
    if [[ -z "$line" ]]; then
        break
    fi
    TODAY_PACKAGES="$TODAY_PACKAGES  - Package: [[packages.$line]]\n"
done

# Now create today's daily note with all the gathered information
echo ""
echo "📝 Creating today's daily note with your input..."

DAILY_NOTE="notes/daily/$DATE.md"

cat > "$DAILY_NOTE" << EOF
---
id: daily.$DATE
title: Daily Note $DATE - Day $DAY_NUMBER Progress Review
desc: 'Daily development journal - Day $DAY_NUMBER of AI-native observability platform'
updated: $DATE
created: $DATE
---

# Daily Note - $DATE - Day $DAY_NUMBER

## 📊 Yesterday's Progress Review

$(if [ ! -z "$GOALS_COMPLETED" ]; then echo "### ✅ Completed Goals"; echo -e "$GOALS_COMPLETED"; fi)
$(if [ ! -z "$GOALS_PARTIAL" ]; then echo "### 🔄 Partially Complete"; echo -e "$GOALS_PARTIAL"; fi)
$(if [ ! -z "$GOALS_NOT_STARTED" ]; then echo "### ❌ Not Started"; echo -e "$GOALS_NOT_STARTED"; fi)

$(if [ ! -z "$ADDITIONAL_THOUGHTS" ] && [ "$ADDITIONAL_THOUGHTS" != "None" ]; then echo "## 💭 Additional Thoughts & Insights"; echo -e "$ADDITIONAL_THOUGHTS"; fi)

## 🎯 Today's Goals
$(echo -e "$TODAY_GOALS")

## 📦 Packages Worked On
$(echo -e "$TODAY_PACKAGES")

## 🚀 Code Generated from Notes
<!-- Track what Claude Code generated today -->

## 📝 Documentation Updated
<!-- Track specification or documentation changes -->

## 🏗️ Infrastructure & Deployment
<!-- Track Docker, Bazel, GitHub setup, OTel Demo integration -->

## 🤖 AI/LLM Integration Work
<!-- Track AI analyzer, LLM manager, UI generator progress -->

## 💡 Claude Code Session Archive
<!-- Key prompts and decisions from today's session -->

## 🐛 Issues & Solutions
<!-- Problems encountered and how they were resolved -->

## 📚 Key Learnings
<!-- Important insights about the project, tools, or approach -->

## 🔮 Tomorrow's Focus
<!-- What should be prioritized next -->

## 🔗 Related Notes
- [[packages]]
- [[design]]
- [[inception]]
- [[root]]
EOF

echo "✅ Daily note created: $DAILY_NOTE"
echo ""
echo "📈 Progress Summary:"
echo "- Day $DAY_NUMBER of 30 ($(( DAY_NUMBER * 100 / 30 ))% complete)"
echo "- Daily note generated with your progress review"
echo "- Ready to start productive Claude Code session"
echo ""
echo "🚀 Suggested Claude Code opening prompt:"
echo "\"I'm ready to continue with Day $DAY_NUMBER of the AI-native observability platform.\""
echo "\"Here's my progress review and today's goals: [reference your daily note]\""
echo ""
echo "📂 Today's daily note: $DAILY_NOTE"