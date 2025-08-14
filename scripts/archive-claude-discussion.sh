#!/bin/bash
# Archive Claude Code discussion to daily note

DATE=$(date +%Y.%m.%d)
DAILY_NOTE="notes/daily/$DATE.md"
ARCHIVE_DIR="notes/daily/archives"
DISCUSSION_FILE="$ARCHIVE_DIR/claude-discussion-$DATE.md"

# Create archives directory if it doesn't exist
mkdir -p "$ARCHIVE_DIR"

echo "📝 Archiving Claude Code discussion for $DATE"
echo ""

# Check if daily note exists
if [ ! -f "$DAILY_NOTE" ]; then
    echo "❌ Daily note doesn't exist: $DAILY_NOTE"
    echo "Run ./scripts/create-daily-note.sh first"
    exit 1
fi

echo "Creating discussion archive template..."

cat > "$DISCUSSION_FILE" << 'EOF'
---
id: claude-discussion.{{DATE}}
title: Claude Code Discussion {{DATE}}
desc: 'Complete Claude Code session archive'
updated: {{DATE}}
created: {{DATE}}
---

# Claude Code Discussion Archive - {{DATE}}

## Session Overview
- **Date**: {{DATE}}
- **Duration**: [Time spent]
- **Main Focus**: [Primary topics discussed]
- **Packages Affected**: [List packages worked on]

## Key Decisions Made
<!-- Important architectural or technical decisions -->
- Decision: 
  - Reasoning: 
  - Impact: 

## Code Generated
<!-- List of code/files generated during session -->
- File: 
  - Purpose: 
  - Key features: 

## Documentation Updated
<!-- Documentation created or modified -->
- Note: 
  - Changes: 
  - Reason: 

## Prompts That Worked Well
<!-- Successful prompts for future reference -->
```
[Paste effective prompts here]
```

## Issues and Solutions
<!-- Problems encountered and how they were resolved -->
- Issue: 
  - Solution: 
  - Lesson learned: 

## Follow-up Actions
<!-- Items to address in future sessions -->
- [ ] Action item 1
- [ ] Action item 2

## Session Transcript
<!-- Complete conversation log -->
```
[Paste the complete Claude Code conversation here]
```

## Related Notes
- [[daily.{{DATE}}]]
- [[packages]]
- [[design]]
EOF

# Replace date placeholders
sed -i "s/{{DATE}}/$DATE/g" "$DISCUSSION_FILE"

echo "✅ Discussion archive template created: $DISCUSSION_FILE"
echo ""
echo "Next steps:"
echo "1. Copy your Claude Code conversation to the Session Transcript section"
echo "2. Fill in the session overview and key decisions"
echo "3. Link the archive from your daily note"
echo ""
echo "To link from daily note, add this line:"
echo "- [[claude-discussion.$DATE]] - Claude Code session archive"
echo ""
echo "Opening archive file..."
code "$DISCUSSION_FILE"