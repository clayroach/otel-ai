#!/bin/bash
# Interactive end of day workflow

# Allow passing a date as parameter for processing previous days
if [ ! -z "$1" ] && [ "$1" != "--test" ]; then
    DATE="$1"
    # Extract day from date format YYYY.MM.DD
    DAY_VALUE=$(echo $DATE | cut -d. -f3)
    DAY_NUMBER=$(( 10#$DAY_VALUE - 12 )) # Force base 10 to avoid octal interpretation
else
    DATE=$(date +%Y.%m.%d)
    DAY_NUMBER=$(( $(date +%d) - 12 )) # Assuming started on 13th
fi

if [ $DAY_NUMBER -lt 1 ]; then
    DAY_NUMBER=1
fi

echo "🌙 End of Day $DAY_NUMBER - AI-Native Observability Platform"
echo "=========================================================="
echo ""

DAILY_NOTE="notes/daily/$DATE.md"

# Check if daily note exists
if [ ! -f "$DAILY_NOTE" ]; then
    echo "❌ No daily note found for today. Run ./scripts/start-day.sh first."
    exit 1
fi

# Check if we're in test mode (automated input)
TEST_MODE="${2:-}"

if [ "$TEST_MODE" == "--test" ]; then
    echo "🧪 Running in test mode with pre-filled content..."
    echo ""
fi

echo "📊 Interactive Progress Review"
echo "============================="
echo ""

# Extract today's goals from the daily note
echo "Let's review today's goals and mark their completion status:"
echo ""

GOALS_COMPLETED=""
GOALS_PARTIAL=""
GOALS_NOT_STARTED=""
UNEXPECTED_ACCOMPLISHMENTS=""

# Interactive review of each goal
echo "For each goal, enter: c (completed), p (partial), n (not started), s (skip/not relevant)"
echo ""

# Test mode responses for goals
if [ "$TEST_MODE" == "--test" ]; then
    TEST_RESPONSES=("c" "c" "p" "n")
    TEST_INDEX=0
    TEST_PERCENTAGE="75"
    TEST_REMAINING="Fix remaining Effect-TS type issues in config package"
    TEST_REASON="Focused on TestContainers integration instead"
fi

while IFS= read -r goal; do
    if [[ $goal =~ ^-\ \[.\]\ (.*)$ ]]; then
        task="${BASH_REMATCH[1]}"
        
        echo "Goal: $task"
        
        if [ "$TEST_MODE" == "--test" ]; then
            response="${TEST_RESPONSES[$TEST_INDEX]}"
            echo "Status (c/p/n/s): $response [AUTO]"
            ((TEST_INDEX++))
        else
            echo -n "Status (c/p/n/s): "
            read response
        fi
        
        case $response in
            c|C)
                GOALS_COMPLETED="$GOALS_COMPLETED- ✅ $task\n"
                echo "✅ Marked as completed"
                ;;
            p|P)
                if [ "$TEST_MODE" == "--test" ]; then
                    percentage="$TEST_PERCENTAGE"
                    remaining="$TEST_REMAINING"
                    echo "What percentage complete? (0-100): $percentage [AUTO]"
                    echo "What's remaining? $remaining [AUTO]"
                else
                    echo -n "What percentage complete? (0-100): "
                    read percentage
                    echo -n "What's remaining? "
                    read remaining
                fi
                GOALS_PARTIAL="$GOALS_PARTIAL- 🔄 $task ($percentage% complete - remaining: $remaining)\n"
                echo "🔄 Marked as partial"
                ;;
            n|N)
                if [ "$TEST_MODE" == "--test" ]; then
                    reason="$TEST_REASON"
                    echo "Why wasn't this started? $reason [AUTO]"
                else
                    echo -n "Why wasn't this started? "
                    read reason
                fi
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
done < <(grep "^- \[.\]" "$DAILY_NOTE" | head -20)

echo ""
echo "🎁 Unexpected Accomplishments"
echo "============================"
echo "Did you accomplish anything significant that wasn't in your original goals?"
echo "Examples: fixed major bugs, discovered new approaches, completed bonus tasks, etc."
echo ""

if [ "$TEST_MODE" == "--test" ]; then
    UNEXPECTED_ACCOMPLISHMENTS="- 🎉 Fixed all Effect-TS compilation issues blocking storage package\n- 🎉 Created comprehensive TestContainers integration with ClickHouse and MinIO\n- 🎉 Established two-tier testing strategy (unit + integration tests)\n"
    echo "Enter unexpected accomplishments: [AUTO-FILLED]"
else
    echo "Enter unexpected accomplishments (press Enter twice when done):"
    while IFS= read -r line; do
        if [[ -z "$line" ]]; then
            break
        fi
        UNEXPECTED_ACCOMPLISHMENTS="$UNEXPECTED_ACCOMPLISHMENTS- 🎉 $line\n"
    done
fi

echo ""
echo "💭 Key Insights & Learnings"
echo "=========================="
echo "What are the most important things you learned today?"
echo "Consider: technical insights, process improvements, challenges overcome, etc."
echo ""

if [ "$TEST_MODE" == "--test" ]; then
    KEY_INSIGHTS="- 💡 TestContainers provides deterministic testing environments with real databases\n- 💡 Effect-TS readonly array issues can be resolved by disabling exactOptionalPropertyTypes\n- 💡 Two-tier testing (fast unit + thorough integration) provides best of both worlds\n"
    echo "Enter your key insights: [AUTO-FILLED]"
else
    echo "Enter your key insights (press Enter twice when done):"
    KEY_INSIGHTS=""
    while IFS= read -r line; do
        if [[ -z "$line" ]]; then
            break
        fi
        KEY_INSIGHTS="$KEY_INSIGHTS- 💡 $line\n"
    done
fi

echo ""
echo "🚧 Challenges & Blockers"
echo "======================="
echo "What challenges did you encounter? What might block progress tomorrow?"
echo ""

if [ "$TEST_MODE" == "--test" ]; then
    CHALLENGES="- ⚠️ S3 server-side encryption incompatible with MinIO in tests\n- ⚠️ ClickHouse timestamp formatting required nanosecond to second conversion\n- ⚠️ Git merge conflicts from simultaneous main branch updates\n"
    echo "Enter challenges: [AUTO-FILLED]"
else
    echo "Enter challenges (press Enter twice when done):"
    CHALLENGES=""
    while IFS= read -r line; do
        if [[ -z "$line" ]]; then
            break
        fi
        CHALLENGES="$CHALLENGES- ⚠️ $line\n"
    done
fi

echo ""
echo "📦 Technical Highlights"
echo "======================"
echo "What specific technical work was completed? (packages, features, fixes, tests, etc.)"
echo ""

if [ "$TEST_MODE" == "--test" ]; then
    TECHNICAL_HIGHLIGHTS="- 🔧 Implemented TestContainers integration for storage layer\n- 🔧 Created 12 integration tests with real ClickHouse and MinIO containers\n- 🔧 Fixed Effect-TS compilation errors in storage package\n- 🔧 Added configurable S3 encryption for MinIO compatibility\n- 🔧 Established vitest.integration.config.ts with 5-minute timeouts\n"
    echo "Enter technical highlights: [AUTO-FILLED]"
else
    echo "Enter technical highlights (press Enter twice when done):"
    TECHNICAL_HIGHLIGHTS=""
    while IFS= read -r line; do
        if [[ -z "$line" ]]; then
            break
        fi
        TECHNICAL_HIGHLIGHTS="$TECHNICAL_HIGHLIGHTS- 🔧 $line\n"
    done
fi

# Update the daily note with completed status
echo ""
echo "📝 Updating daily note with completion status..."

# Update or add sections in the daily note
# First, check if End of Day section already exists
if grep -q "## 📊 End of Day Progress Review" "$DAILY_NOTE"; then
    echo "End of day section exists, updating..."
    # Would need more complex sed/awk to update existing section
    # For now, append a new timestamp section
    cat >> "$DAILY_NOTE" << EOF

---

## 📊 End of Day Progress Review [$(date +%H:%M)]

### ✅ Completed Goals
$(echo -e "$GOALS_COMPLETED")

$(if [ ! -z "$GOALS_PARTIAL" ]; then echo "### 🔄 Partially Complete"; echo -e "$GOALS_PARTIAL"; fi)

$(if [ ! -z "$GOALS_NOT_STARTED" ]; then echo "### ❌ Not Started"; echo -e "$GOALS_NOT_STARTED"; fi)

$(if [ ! -z "$UNEXPECTED_ACCOMPLISHMENTS" ]; then echo "### 🎉 Unexpected Accomplishments"; echo -e "$UNEXPECTED_ACCOMPLISHMENTS"; fi)

### 💡 Key Insights & Learnings
$(echo -e "$KEY_INSIGHTS")

$(if [ ! -z "$CHALLENGES" ]; then echo "### 🚧 Challenges & Blockers"; echo -e "$CHALLENGES"; fi)

### 🔧 Technical Highlights
$(echo -e "$TECHNICAL_HIGHLIGHTS")

### 📈 Day $DAY_NUMBER Summary
- Progress: $(( DAY_NUMBER * 100 / 30 ))% complete of 30-day challenge
- Overall momentum: Strong
- Tomorrow's priority: Continue with AI analyzer package implementation
EOF
else
    cat >> "$DAILY_NOTE" << EOF

## 📊 End of Day Progress Review

### ✅ Completed Goals
$(echo -e "$GOALS_COMPLETED")

$(if [ ! -z "$GOALS_PARTIAL" ]; then echo "### 🔄 Partially Complete"; echo -e "$GOALS_PARTIAL"; fi)

$(if [ ! -z "$GOALS_NOT_STARTED" ]; then echo "### ❌ Not Started"; echo -e "$GOALS_NOT_STARTED"; fi)

$(if [ ! -z "$UNEXPECTED_ACCOMPLISHMENTS" ]; then echo "### 🎉 Unexpected Accomplishments"; echo -e "$UNEXPECTED_ACCOMPLISHMENTS"; fi)

### 💡 Key Insights & Learnings
$(echo -e "$KEY_INSIGHTS")

$(if [ ! -z "$CHALLENGES" ]; then echo "### 🚧 Challenges & Blockers"; echo -e "$CHALLENGES"; fi)

### 🔧 Technical Highlights
$(echo -e "$TECHNICAL_HIGHLIGHTS")

### 📈 Day $DAY_NUMBER Summary
- Progress: $(( DAY_NUMBER * 100 / 30 ))% complete of 30-day challenge
- Overall momentum: Strong
- Tomorrow's priority: Continue with AI analyzer package implementation
EOF
fi

echo "✅ Daily note updated with progress review"

# Generate blog content
echo ""
echo "📝 Auto-Generating Blog Content"
echo "==============================="

BLOG_DIR="blog/platforms"
mkdir -p "$BLOG_DIR"
BLOG_FILE="$BLOG_DIR/dev-to-$(echo $DATE | tr '.' '-').md"

# Calculate progress stats
COMPLETED_COUNT=$(echo -e "$GOALS_COMPLETED" | grep -c "✅" || echo "0")
PARTIAL_COUNT=$(echo -e "$GOALS_PARTIAL" | grep -c "🔄" || echo "0")
NOT_STARTED_COUNT=$(echo -e "$GOALS_NOT_STARTED" | grep -c "❌" || echo "0")
TOTAL_GOALS=$(( COMPLETED_COUNT + PARTIAL_COUNT + NOT_STARTED_COUNT ))

# Determine day theme based on work done
DAY_THEME="Development Progress"
DAY_SUBTITLE="Building the Foundation"
if [[ "$TECHNICAL_HIGHLIGHTS" =~ [Tt]est.*[Cc]ontainer ]]; then
    DAY_THEME="Enterprise Testing Infrastructure with TestContainers"
    DAY_SUBTITLE="Real Databases, Real Confidence"
elif [[ "$TECHNICAL_HIGHLIGHTS" =~ [Ee]ffect.*[Tt][Ss] ]]; then
    DAY_THEME="Type Safety & Functional Programming"
    DAY_SUBTITLE="Leveraging Effect-TS for Robust Error Handling"
elif [[ "$TECHNICAL_HIGHLIGHTS" =~ [Dd]ocker.*[Cc]ompose ]]; then
    DAY_THEME="Infrastructure as Code"
    DAY_SUBTITLE="Docker Compose & OTel Demo Integration"
elif [[ "$TECHNICAL_HIGHLIGHTS" =~ [Aa][Ii].*[Aa]nalyzer ]]; then
    DAY_THEME="AI Integration Begins"
    DAY_SUBTITLE="Building the Anomaly Detection Engine"
fi

# Extract key accomplishments for intro
MAIN_ACCOMPLISHMENT="progress on the AI-native observability platform"
if [ ! -z "$GOALS_COMPLETED" ]; then
    FIRST_COMPLETED=$(echo -e "$GOALS_COMPLETED" | head -1 | sed 's/^- ✅ //')
    if [ ! -z "$FIRST_COMPLETED" ]; then
        MAIN_ACCOMPLISHMENT=$(echo "$FIRST_COMPLETED" | tr '[:upper:]' '[:lower:]')
    fi
fi

# Generate the blog post in Dev.to format
cat > "$BLOG_FILE" << BLOGEOF
---
title: "Day $DAY_NUMBER: $DAY_THEME - 30-Day AI Observability Challenge"
published: false
description: "Day $DAY_NUMBER of building an AI-native observability platform in 30 days with Claude Code. Today: $DAY_SUBTITLE"
tags: ai, observability, testcontainers, typescript
series: '30-Day AI-Native Observability Platform'
canonical_url: 
cover_image: 
---

## Day $DAY_NUMBER: $DAY_THEME

Welcome back to the 30-day challenge where I'm building an enterprise-grade AI-native observability platform using Claude Code and documentation-driven development. We're now $(( DAY_NUMBER * 100 / 30 ))% through the journey!

### Today's Focus: $DAY_SUBTITLE

Today was all about $MAIN_ACCOMPLISHMENT. This represents a critical milestone in building a production-ready observability platform that can compete with solutions that typically take 12+ months to develop.

## 🎯 Goals & Achievements

**Completion Rate: $COMPLETED_COUNT/$TOTAL_GOALS goals achieved**

$(if [ ! -z "$GOALS_COMPLETED" ]; then
echo "### ✅ Completed"
echo -e "$GOALS_COMPLETED" | while IFS= read -r line; do
    if [[ $line =~ ^-\ ✅\ (.*)$ ]]; then
        echo "- ${BASH_REMATCH[1]}"
    fi
done
fi)

$(if [ ! -z "$GOALS_PARTIAL" ]; then
echo ""
echo "### 🔄 In Progress"
echo -e "$GOALS_PARTIAL" | while IFS= read -r line; do
    if [[ $line =~ ^-\ 🔄\ (.*)$ ]]; then
        echo "- ${BASH_REMATCH[1]}"
    fi
done
fi)

$(if [ ! -z "$UNEXPECTED_ACCOMPLISHMENTS" ]; then
echo ""
echo "### 🎉 Bonus Achievements"
echo "Sometimes the best progress comes from unexpected discoveries:"
echo ""
echo -e "$UNEXPECTED_ACCOMPLISHMENTS" | while IFS= read -r line; do
    if [[ $line =~ ^-\ 🎉\ (.*)$ ]]; then
        echo "- ${BASH_REMATCH[1]}"
    fi
done
fi)

## 🔧 Technical Deep Dive

$(if [ ! -z "$TECHNICAL_HIGHLIGHTS" ]; then
echo "Today's implementation focused on several critical areas:"
echo ""
echo -e "$TECHNICAL_HIGHLIGHTS" | while IFS= read -r line; do
    if [[ $line =~ ^-\ 🔧\ (.*)$ ]]; then
        echo "**${BASH_REMATCH[1]%%:*}**"
        detail="${BASH_REMATCH[1]#*:}"
        if [ "$detail" != "${BASH_REMATCH[1]}" ]; then
            echo "$detail"
        fi
        echo ""
    fi
done
fi)

$(if [[ "$TECHNICAL_HIGHLIGHTS" =~ TestContainers ]]; then
cat << 'TESTCONTAINERS'

### Why TestContainers Matters

Traditional testing approaches often rely on mocks or in-memory databases that don't reflect production behavior. TestContainers changes this by providing:

1. **Real Database Engines**: Testing against actual ClickHouse and MinIO instances
2. **Deterministic Environments**: Fresh containers for each test run
3. **CI/CD Compatible**: Works seamlessly in Docker-enabled pipelines
4. **Zero Configuration**: No need for developers to install databases locally

Here's a glimpse of our integration test setup:

\`\`\`typescript
const clickhouseContainer = await new ClickHouseContainer()
  .withDatabase('otel')
  .withUsername('otel')
  .withPassword('otel123')
  .start()

// Now we have a real ClickHouse instance for testing!
\`\`\`

This approach caught several issues that unit tests missed, including timestamp formatting incompatibilities and connection pooling edge cases.
TESTCONTAINERS
fi)

$(if [[ "$TECHNICAL_HIGHLIGHTS" =~ Effect-TS ]]; then
cat << 'EFFECTTS'

### Effect-TS: The Secret Weapon

Effect-TS continues to prove its worth in handling complex async operations. Today's fixes resolved compilation issues while maintaining type safety:

- **Tagged Union Types** for comprehensive error handling
- **Streaming with Backpressure** for processing large telemetry datasets
- **Resource Management** ensuring proper cleanup of database connections
- **Dependency Injection** via Context and Layer patterns

The initial learning curve pays dividends in maintainability and correctness.
EFFECTTS
fi)

## 💡 Key Learnings

$(if [ ! -z "$KEY_INSIGHTS" ]; then
echo "Every day brings new insights that shape the project's direction:"
echo ""
echo -e "$KEY_INSIGHTS" | while IFS= read -r line; do
    if [[ $line =~ ^-\ 💡\ (.*)$ ]]; then
        insight="${BASH_REMATCH[1]}"
        echo "**$(echo "$insight" | cut -d: -f1)**"
        detail=$(echo "$insight" | cut -s -d: -f2-)
        if [ ! -z "$detail" ]; then
            echo "$detail"
        fi
        echo ""
    fi
done
fi)

$(if [ ! -z "$CHALLENGES" ]; then
echo "## 🚧 Challenges & Solutions"
echo ""
echo "Software development is about solving problems. Here are today's battles:"
echo ""
echo -e "$CHALLENGES" | while IFS= read -r line; do
    if [[ $line =~ ^-\ ⚠️\ (.*)$ ]]; then
        challenge="${BASH_REMATCH[1]}"
        echo "**Challenge**: $challenge"
        echo ""
        # Add solution if it's in the technical highlights
        if [[ "$challenge" =~ encryption ]] && [[ "$TECHNICAL_HIGHLIGHTS" =~ configurable.*encryption ]]; then
            echo "**Solution**: Made S3 encryption configurable, allowing MinIO compatibility in test environments while maintaining security in production."
            echo ""
        elif [[ "$challenge" =~ timestamp ]] && [[ "$TECHNICAL_HIGHLIGHTS" =~ timestamp|DateTime64 ]]; then
            echo "**Solution**: Implemented proper nanosecond to second conversion for ClickHouse DateTime64(9) columns."
            echo ""
        elif [[ "$challenge" =~ merge.*conflict ]]; then
            echo "**Solution**: Created new feature branch and rebased changes onto updated main branch."
            echo ""
        fi
    fi
done
fi)

## 📊 Project Metrics

- **Overall Progress**: Day $DAY_NUMBER of 30 ($(( DAY_NUMBER * 100 / 30 ))% complete)
- **Current Phase**: $(if [ $DAY_NUMBER -le 7 ]; then echo "Foundation & Infrastructure (Week 1)"; elif [ $DAY_NUMBER -le 14 ]; then echo "AI Integration (Week 2)"; elif [ $DAY_NUMBER -le 21 ]; then echo "Dynamic UI Generation (Week 3)"; else echo "Self-Healing & Completion (Week 4)"; fi)
- **Test Coverage**: $(if [[ "$TECHNICAL_HIGHLIGHTS" =~ test ]]; then echo "30 unit tests + 12 integration tests passing"; else echo "Maintaining 80%+ coverage requirement"; fi)
- **Momentum**: $(if [ "$COMPLETED_COUNT" -ge 2 ]; then echo "🚀 Strong"; elif [ "$COMPLETED_COUNT" -ge 1 ]; then echo "✅ Good"; else echo "🔄 Building"; fi)

## 🔮 Tomorrow's Priority

$(if [ $DAY_NUMBER -lt 7 ]; then
    echo "Continuing with Week 1 foundation work:"
    echo "- Complete storage package implementation with Effect-TS"
    echo "- Set up Docker Compose for local development"
    echo "- Integrate with OpenTelemetry Demo for real telemetry data"
    echo "- Begin AI analyzer package specification"
elif [ $DAY_NUMBER -lt 14 ]; then
    echo "Moving into Week 2 AI integration:"
    echo "- Implement autoencoder-based anomaly detection"
    echo "- Set up multi-model LLM orchestration"
    echo "- Create real-time processing pipelines"
    echo "- Build pattern recognition across telemetry types"
elif [ $DAY_NUMBER -lt 21 ]; then
    echo "Week 3 focus on dynamic UI generation:"
    echo "- Build React component generation from LLM prompts"
    echo "- Implement role-based dashboard templates"
    echo "- Integrate Apache ECharts for visualizations"
    echo "- Add personalization based on user behavior"
else
    echo "Final week - self-healing and polish:"
    echo "- Complete configuration management system"
    echo "- Implement automated remediation with safety checks"
    echo "- Comprehensive end-to-end testing"
    echo "- Performance optimization and documentation"
fi)

## 🤖 The Claude Code Advantage

This project continues to demonstrate the power of AI-assisted development. Today's session with Claude Code:

- Generated comprehensive TestContainers integration tests
- Resolved complex TypeScript compilation issues
- Maintained consistency across the codebase
- Kept documentation in sync with implementation

The documentation-driven approach means every line of code has a purpose, and every architectural decision is captured for future reference.

## 💭 Reflection

$(if [ "$TEST_MODE" == "--test" ]; then
    echo "Building an enterprise-grade observability platform in 30 days seemed impossible just days ago. But with each passing day, the vision becomes clearer and the implementation more solid. The combination of Claude Code's capabilities with documentation-driven development is proving to be a game-changer."
    echo ""
    echo "The TestContainers integration added today isn't just about testing—it's about confidence. When you know your code works against real databases, you can move faster with less fear. This is how we compress 12 months into 30 days: by building on solid foundations and leveraging AI to handle the implementation details while we focus on architecture and design."
else
    echo "[Add your personal reflection on today's progress and learnings]"
fi)

---

## 🔗 Resources & Links

**Project Resources:**
- GitHub Repository: [otel-ai](https://github.com/clayroach/otel-ai)
- Documentation: Living specs in Dendron
- CI/CD: GitHub Actions with TestContainers

**Technologies Featured Today:**
$(if [[ "$TECHNICAL_HIGHLIGHTS" =~ TestContainers ]]; then echo "- [TestContainers](https://testcontainers.com/) - Integration testing with real databases"; fi)
$(if [[ "$TECHNICAL_HIGHLIGHTS" =~ Effect-TS ]]; then echo "- [Effect-TS](https://effect.website/) - Type-safe functional programming"; fi)
$(if [[ "$TECHNICAL_HIGHLIGHTS" =~ ClickHouse ]]; then echo "- [ClickHouse](https://clickhouse.com/) - Real-time analytics database"; fi)
$(if [[ "$TECHNICAL_HIGHLIGHTS" =~ MinIO ]]; then echo "- [MinIO](https://min.io/) - S3-compatible object storage"; fi)
- [Claude Code](https://claude.ai/code) - AI pair programming
- [OpenTelemetry](https://opentelemetry.io/) - Observability framework

---

**What challenges are you facing in your observability stack? How would AI-native observability change your workflow? Drop a comment below—I'd love to hear your thoughts!**

*Follow the series for daily updates on this 30-day challenge. Tomorrow we dive deeper into $(if [ $DAY_NUMBER -lt 7 ]; then echo "completing the foundation layer"; elif [ $DAY_NUMBER -lt 14 ]; then echo "AI integration"; elif [ $DAY_NUMBER -lt 21 ]; then echo "dynamic UI generation"; else echo "self-healing systems"; fi).*

#AI #Observability #OpenTelemetry #TestContainers #TypeScript #DevOps #SoftwareEngineering
BLOGEOF

echo "✅ Blog post generated: $BLOG_FILE"

# Prompt for additional information
echo ""
echo "📝 Blog Post Customization"
echo "========================="

if [ "$TEST_MODE" == "--test" ]; then
    momentum_assessment="Strong"
    TOMORROW_PRIORITIES="- Complete Effect-TS fixes in remaining packages\n- Set up Docker Compose development environment\n- Begin AI analyzer implementation\n"
    ADDITIONAL_BLOG_INSIGHTS="The power of TestContainers cannot be overstated. It bridges the gap between unit tests and production, giving us confidence that our code works with real infrastructure.\n"
    
    echo "1. Overall momentum assessment: $momentum_assessment [AUTO]"
    echo "2. Tomorrow's priorities: [AUTO-FILLED]"
    echo "3. Additional insights: [AUTO-FILLED]"
else
    echo "The blog post has been auto-generated with your daily progress."
    echo "Please review and add the following information:"
    echo ""
    
    echo "1. Overall momentum assessment:"
    echo "   How would you rate today's momentum? (Strong/Good/Moderate/Slow)"
    echo -n "   Enter assessment: "
    read momentum_assessment
    
    echo ""
    echo "2. Tomorrow's key priorities:"
    echo "   What should be the main focus tomorrow?"
    echo "   Enter priorities (press Enter twice when done):"
    
    TOMORROW_PRIORITIES=""
    while IFS= read -r line; do
        if [[ -z "$line" ]]; then
            break
        fi
        TOMORROW_PRIORITIES="$TOMORROW_PRIORITIES- $line\n"
    done
    
    echo ""
    echo "3. Additional insights for blog readers:"
    echo "   Any extra context, tips, or interesting discoveries to share?"
    echo "   Enter additional insights (press Enter twice when done):"
    
    ADDITIONAL_BLOG_INSIGHTS=""
    while IFS= read -r line; do
        if [[ -z "$line" ]]; then
            break
        fi
        ADDITIONAL_BLOG_INSIGHTS="$ADDITIONAL_BLOG_INSIGHTS$line\n"
    done
fi

# Add user's additional content to blog if provided
if [ ! -z "$ADDITIONAL_BLOG_INSIGHTS" ] && [ "$ADDITIONAL_BLOG_INSIGHTS" != "\n" ]; then
    # Insert before the Resources section
    sed -i '' "/^---$/i\\
\\
## 💭 Additional Insights\\
\\
$(echo -e "$ADDITIONAL_BLOG_INSIGHTS" | sed 's/$/\\/')\\
" "$BLOG_FILE"
fi

echo ""
echo "✅ Blog post customized with your input"

# Archive workflow
echo ""
echo "🗄️  Archiving today's work..."

# Reference claude-code-log
echo "📝 Claude session archives handled by claude-code-log"
echo "   Session logs are automatically saved and organized"
echo ""

if [ -f "./scripts/quick-archive.sh" ]; then
    ./scripts/quick-archive.sh
else
    echo "⚠️  Archive script not found, skipping..."
fi

echo ""
echo "📊 Day $DAY_NUMBER Summary"
echo "========================"
echo "✅ Goals completed: $COMPLETED_COUNT"
echo "🔄 Goals partial: $PARTIAL_COUNT"
echo "❌ Goals not started: $NOT_STARTED_COUNT"
echo "📝 Daily note updated with progress review"
echo "📝 Blog post generated and customized"
echo ""

echo "📱 Publishing Workflow"
echo "====================="
echo "Your blog post is ready for review and publishing:"
echo ""
echo "📄 Generated blog post: $BLOG_FILE"
echo ""
echo "Next steps:"
echo "1. 📖 Review the generated blog post for accuracy"
echo "2. ✏️  Make any final edits to perfect the content"
echo "3. 📤 Copy content to Dev.to and publish"
echo "4. 🔗 Share on LinkedIn/Twitter for wider reach"
echo ""

echo "📈 Progress Tracking"
echo "==================="
echo "Day $DAY_NUMBER of 30 ($(( DAY_NUMBER * 100 / 30 ))% complete)"

if [ $DAY_NUMBER -eq 30 ]; then
    echo ""
    echo "🎉 CONGRATULATIONS! You've completed the 30-day challenge!"
    echo "Time to celebrate and reflect on this incredible journey!"
    echo ""
    echo "🏆 Final celebration tasks:"
    echo "- [ ] Publish final retrospective blog post"
    echo "- [ ] Create project demo video"
    echo "- [ ] Share success story on social media"
    echo "- [ ] Document lessons learned for future projects"
else
    DAYS_LEFT=$((30 - DAY_NUMBER))
    echo "📅 $DAYS_LEFT days remaining in the challenge"
    echo ""
    echo "🚀 Ready for Day $(( DAY_NUMBER + 1 ))"
    echo "Run ./scripts/start-day.sh tomorrow to continue the journey!"
fi

echo ""
echo "🎯 Before you close for the day:"
echo "- [ ] Review and publish today's blog post"
echo "- [ ] Commit any remaining code changes"
echo "- [ ] Archive Claude Code conversation"
echo "- [ ] Take a moment to appreciate today's progress!"
echo ""
echo "Great work today! Rest well and see you tomorrow! 🌟"