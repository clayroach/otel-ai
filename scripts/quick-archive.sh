#!/bin/bash
# Quick archive today's Claude discussion and generate blog

echo "🔄 Quick Archive & Blog Generation"
echo "=================================="
echo ""

# Step 1: Create discussion archive
echo "1️⃣ Creating Claude discussion archive..."
./scripts/archive-claude-discussion.sh

echo ""
echo "2️⃣ Generating blog from daily note..."
./scripts/generate-blog-from-daily.sh

echo ""
echo "✅ Complete! Both archive and blog generated."
echo ""
echo "📝 Next steps:"
echo "1. Fill in the Claude discussion archive with your conversation"
echo "2. Review the generated blog posts"
echo "3. Publish to your preferred platforms"
echo ""
echo "📁 Files created:"
echo "   - Discussion archive: notes/daily/archives/claude-discussion-$(date +%Y.%m.%d).md"
echo "   - Blog posts: blog/day-$(date +%Y-%m-%d).md"
echo "   - Platform versions: blog/platforms/"