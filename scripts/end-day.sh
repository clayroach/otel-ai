#!/bin/bash
# End of day workflow

echo "🌙 End of Day $(date +%d) - AI-Native Observability Platform"
echo "======================================================="
echo ""

DATE=$(date +%Y.%m.%d)
DAILY_NOTE="notes/daily/$DATE.md"

# Check if daily note exists
if [ ! -f "$DAILY_NOTE" ]; then
    echo "❌ No daily note found for today. Run ./scripts/start-day.sh first."
    exit 1
fi

echo "📊 Today's Progress Summary:"
echo ""

# Show completed goals
echo "✅ Completed Goals:"
grep "^- \[x\]" "$DAILY_NOTE" | sed 's/^- \[x\] /   ✅ /' || echo "   (Update your daily note with completed goals)"
echo ""

# Show packages worked on
echo "📦 Packages Modified:"
grep "Package.*:" "$DAILY_NOTE" | sed 's/^/   /' || echo "   (Update your daily note with packages worked on)"
echo ""

# Archive workflow
echo "🗄️  Archiving today's work..."
./scripts/quick-archive.sh

echo ""
echo "📝 Next steps:"
echo "1. Copy your Claude Code conversation to: notes/daily/archives/claude-discussion-$DATE.md"
echo "2. Review the generated blog post: blog/day-$(echo $DATE | tr '.' '-').md"
echo "3. Publish to your chosen platform(s)"
echo ""

echo "📱 Publishing checklist:"
echo "- [ ] Review Dev.to post content for accuracy"
echo "- [ ] Add any final insights or reflections"
echo "- [ ] Publish to Dev.to (copy from generated file)"
echo "- [ ] Optional: Share link on other platforms later"
echo ""

echo "🎯 Set tomorrow's goals in your daily note before closing!"
echo ""

# Calculate day number
DAY_NUMBER=$(( $(date +%d) - 12 )) # Assuming started on 13th
if [ $DAY_NUMBER -lt 1 ]; then
    DAY_NUMBER=1
fi

echo "📈 Progress: Day $DAY_NUMBER of 30 ($(( DAY_NUMBER * 100 / 30 ))% complete)"

if [ $DAY_NUMBER -eq 30 ]; then
    echo ""
    echo "🎉 CONGRATULATIONS! You've completed the 30-day challenge!"
    echo "Time to celebrate and reflect on this incredible journey!"
fi