# Screenshot URL Template

## Standard GitHub Pages URLs

All screenshots should use the GitHub Pages hosting for permanent, external-accessible URLs:

### **Base URL Pattern:**
```
https://clayroach.github.io/otel-ai/screenshots/YYYY-MM-DD/filename.png
```

### **Examples:**
```markdown
![Description](https://clayroach.github.io/otel-ai/screenshots/2025-08-29/claude-results.png)
*Caption explaining what the screenshot demonstrates*
```

## Screenshot Organization

### **File Naming Convention:**
- `claude-results.png` - Claude model analysis results
- `gpt-results.png` - GPT-4 model analysis results  
- `llama-results.png` - Llama model analysis results
- `statistical-results.png` - Statistical baseline analysis
- `pr-XX-feature-name.png` - PR-specific screenshots
- `daily-milestone.png` - Daily progress screenshots
- `blog-topic-screenshot.png` - Blog post specific images

### **Directory Structure:**
```
notes/screenshots/
├── 2025-08-29/
│   ├── README.md
│   ├── claude-results.png
│   ├── gpt-results.png
│   └── llama-results.png
├── 2025-08-30/
│   └── ...
└── template-README.md
```

## Automated Sync

Screenshots are automatically synced to GitHub Pages via `.github/workflows/sync-screenshots-to-pages.yml`:

1. **Trigger**: Changes to `notes/screenshots/**` on main branch
2. **Process**: Copies screenshots maintaining directory structure
3. **Result**: Available at `https://clayroach.github.io/otel-ai/screenshots/`

## Usage Guidelines

### **For Blog Posts:**
Always use GitHub Pages URLs for external publications (Dev.to, Medium, etc.):
```markdown
![Claude Analysis](https://clayroach.github.io/otel-ai/screenshots/2025-08-29/claude-results.png)
```

### **For PR Documentation:**
Reference screenshots using relative paths in repository documentation:
```markdown
![PR Screenshot](notes/screenshots/2025-08-29/pr-30-feature.png)
```

### **For README Files:**
Use GitHub Pages URLs in README files that may be viewed externally:
```markdown
![Demo Screenshot](https://clayroach.github.io/otel-ai/screenshots/2025-08-29/demo.png)
```

## Verification

To verify screenshots are accessible:
1. Check local file exists: `notes/screenshots/YYYY-MM-DD/filename.png`
2. Verify GitHub Pages URL: `https://clayroach.github.io/otel-ai/screenshots/YYYY-MM-DD/filename.png`
3. Test in incognito/private browser to ensure public accessibility