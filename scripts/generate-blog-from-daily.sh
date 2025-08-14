#!/bin/bash
# Generate blog post from Dendron daily note

DATE=${1:-$(date +%Y.%m.%d)}
DAILY_NOTE="notes/daily/$DATE.md"
BLOG_DIR="blog"
BLOG_FILE="$BLOG_DIR/day-$(echo $DATE | tr '.' '-').md"

# Create blog directory if it doesn't exist
mkdir -p "$BLOG_DIR"

echo "📝 Generating blog post from daily note: $DATE"
echo ""

# Check if daily note exists
if [ ! -f "$DAILY_NOTE" ]; then
    echo "❌ Daily note doesn't exist: $DAILY_NOTE"
    echo "Available daily notes:"
    ls notes/daily/*.md 2>/dev/null | head -5
    exit 1
fi

# Extract blog content from daily note
echo "Extracting blog content from daily note..."

# Look for blog section in the daily note
if grep -q "## 📝 Blog Post" "$DAILY_NOTE"; then
    # Extract everything after the blog post section
    sed -n '/## 📝 Blog Post/,$p' "$DAILY_NOTE" | sed '1d' > "$BLOG_FILE.tmp"
    
    # Add blog metadata header
    cat > "$BLOG_FILE" << EOF
---
title: "$(grep -o 'Day [0-9]*: [^-]*' "$BLOG_FILE.tmp" | head -1)"
date: $(date -j -f "%Y.%m.%d" "$DATE" "+%Y-%m-%d" 2>/dev/null || echo "$DATE")
author: "Clay Roach"
tags: ["AI-native", "observability", "Claude Code", "documentation-driven", "Effect-TS"]
category: "development"
summary: "$(head -10 "$BLOG_FILE.tmp" | grep -v '^#' | grep -v '^$' | head -1)"
---

EOF
    
    # Append the extracted content
    cat "$BLOG_FILE.tmp" >> "$BLOG_FILE"
    rm "$BLOG_FILE.tmp"
    
    echo "✅ Blog post generated: $BLOG_FILE"
else
    echo "❌ No blog post section found in daily note"
    echo "Add a '## 📝 Blog Post' section to your daily note first"
    echo ""
    echo "Example structure:"
    echo "## 📝 Blog Post"
    echo ""
    echo "# Your Blog Title"
    echo ""
    echo "Your blog content here..."
    exit 1
fi

# Generate Dev.to format (primary publishing platform)
echo ""
echo "Generating Dev.to post..."

DEV_TO_FILE="$BLOG_DIR/dev-to-$(echo $DATE | tr '.' '-').md"

# Create Dev.to format with frontmatter
cat > "$DEV_TO_FILE" << EOF
---
title: $(grep "^title:" "$BLOG_FILE" | cut -d'"' -f2)
published: false
description: $(grep "^summary:" "$BLOG_FILE" | cut -d'"' -f2)
tags: ai, observability, claude, otel
series: "30-Day AI-Native Observability Platform"
canonical_url: 
cover_image: 
---

EOF

# Add content without the frontmatter and fix heading hierarchy for accessibility
sed '1,/^---$/d' "$BLOG_FILE" | sed '1,/^---$/d' | sed 's/^# /## /' | sed 's/^## The /### The /' | sed 's/^## Day /## Day /' >> "$DEV_TO_FILE"

echo "✅ Generated Dev.to post: $DEV_TO_FILE"

echo ""
echo "🚀 Ready to publish on Dev.to!"
echo ""
echo "Next steps:"
echo "1. Copy content from: $DEV_TO_FILE"
echo "2. Paste into Dev.to editor"
echo "3. Review and publish"
echo ""
echo "Command to open file:"
echo "   code '$DEV_TO_FILE'"

# Update daily note with blog generation info
if ! grep -q "Blog generated:" "$DAILY_NOTE"; then
    echo "" >> "$DAILY_NOTE"
    echo "## 📰 Blog Generation" >> "$DAILY_NOTE"
    echo "- Blog generated: $(date)" >> "$DAILY_NOTE"
    echo "- Dev.to post: $DEV_TO_FILE" >> "$DAILY_NOTE"
    echo "- Status: Ready for Dev.to publishing" >> "$DAILY_NOTE"
fi

echo ""
echo "📝 Updated daily note with blog generation info"