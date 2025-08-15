# UI Package Screenshots

This directory contains screenshots and visual documentation for the UI package, organized by date and feature.

## Organization Structure

```
screenshots/
├── README.md                           # This file
├── 2025-08-15-dual-ingestion-ui/      # Date-based folders
│   ├── feature-overview.png           # Main feature screenshots
│   ├── resizable-panels.png           # Specific functionality
│   ├── query-editor.png               # Component details
│   └── trace-results.png              # Result views
└── YYYY-MM-DD-feature-name/           # Future screenshots
```

## Naming Conventions

### Folder Names
- Format: `YYYY-MM-DD-feature-name`
- Use kebab-case for feature names
- Examples:
  - `2025-08-15-dual-ingestion-ui`
  - `2025-08-16-dashboard-improvements`

### File Names
- Use descriptive, kebab-case names
- Include component/feature context
- Examples:
  - `feature-overview.png` - Overall feature demonstration
  - `query-editor-toolbar.png` - Specific component detail
  - `resizable-panels-demo.gif` - Interactive feature demo
  - `error-handling.png` - Edge case scenarios

## Usage Guidelines

### For PR Documentation
- Include `feature-overview.png` in PR description
- Reference specific component screenshots for detailed reviews
- Link to this directory for complete visual documentation

### For Blog Posts
- Use `feature-overview.png` as hero image
- Include component details for technical explanations
- Create animated GIFs for interactive features

### For Package Documentation
- Reference screenshots in `../package.md`
- Include before/after comparisons for improvements
- Document UI states and user flows

## Screenshot Standards

### Technical Requirements
- **Resolution**: Minimum 1920x1080 for desktop views
- **Format**: PNG for static images, GIF for animations
- **Quality**: High resolution, clear text
- **Browser**: Latest Chrome with developer tools closed

### Content Guidelines
- **Sample Data**: Use realistic test data
- **UI State**: Show fully loaded, interactive state
- **Annotations**: Add callouts for key features when needed
- **Consistency**: Same browser, theme, and zoom level

## Current Screenshots

### 2025-08-15 - Dual Ingestion UI
- **feature-overview.png**: Complete UI showing dual ingestion visualization
- **resizable-panels.png**: Demonstrating drag-to-resize functionality
- **query-editor-toolbar.png**: Editor functions and history dropdown
- **trace-results-table.png**: Results display with both ingestion paths