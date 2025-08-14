# Daily Workflow Guide

## 🌅 Morning Routine (2-3 minutes)

```bash
./scripts/start-day.sh
```

This will:

- Create today's daily note
- Show yesterday's follow-up actions
- Provide a daily checklist
- Suggest Claude Code opening prompt

**Then simply start your Claude Code session with:**

> "I'm ready to continue with Day X of the AI-native observability platform. Today's main goals: [your specific objectives]"

## 🌙 Evening Routine (5 minutes)

```bash
./scripts/end-day.sh
```

This will:

- Show today's progress summary
- Archive your work automatically
- Generate blog posts for all platforms
- Provide publishing checklist

**Additional steps:**

1. Copy your Claude Code conversation to the discussion archive
2. Review and polish your blog post
3. Publish to your chosen platform(s)

## 📱 Publishing Strategy

### Primary Platform: **Dev.to**

- Daily posts in "30-Day AI-Native Observability Platform" series
- Developer-focused audience
- Built-in community engagement
- File location: `blog/platforms/dev-to-YYYY-MM-DD.md`

### Secondary Platform: **Medium**

- Cross-post after 2-3 days for broader reach
- Professional credibility and potential revenue
- File location: `blog/platforms/medium-YYYY-MM-DD.md`

### Supplementary: **LinkedIn**

- Share highlights and drive traffic
- Professional network exposure
- File location: `blog/platforms/linkedin-YYYY-MM-DD.md`

## 🔄 Simple Daily Pattern

1. **Morning**: Run start script, set goals, begin Claude session
2. **During day**: Work naturally with Claude Code
3. **Evening**: Run end script, archive work, publish blog

No complex commands to remember - just natural conversation with Claude Code and two simple scripts to bookend your day!

## 📈 Progress Tracking

The end-day script automatically calculates and shows:

- Day number (X of 30)
- Percentage complete
- Completed goals and packages modified
- Publishing checklist

## 🎯 Tips for Success

- **Be specific with daily goals** (3-5 concrete objectives)
- **Update your daily note** as you work (helps with blog generation)
- **Copy Claude conversations** to the archive (preserves context)
- **Publish consistently** (builds audience and momentum)
- **Review yesterday's work** before starting new day
