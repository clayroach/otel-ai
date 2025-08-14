#!/bin/bash
# Create today's daily note

DATE=$(date +%Y.%m.%d)
NOTE_FILE="notes/daily/$DATE.md"

if [ -f "$NOTE_FILE" ]; then
    echo "Daily note already exists: $NOTE_FILE"
    echo "Opening in VSCode..."
    code "$NOTE_FILE"
else
    echo "Creating daily note: $NOTE_FILE"
    cp notes/templates/daily.md "$NOTE_FILE"
    sed -i "s/{{date}}/$DATE/g" "$NOTE_FILE"
    code "$NOTE_FILE"
    echo "✅ Daily note created and opened"
    echo ""
    echo "Remember to:"
    echo "1. Set today's goals"
    echo "2. Link to packages you'll work on"
    echo "3. Document OpenTelemetry decisions"
    echo "4. Save useful Copilot prompts"
fi
