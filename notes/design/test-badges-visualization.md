---
id: test-badges-visualization
title: GitHub Test Badges & CI Reporting
desc: Setup guide for GitHub test badges, CI reporting, and PR test summaries
updated: 2025-01-10
created: 2025-01-10
---

# GitHub Test Badges & CI Reporting

## Overview

GitHub-focused test reporting system providing:
- **GitHub Badges** - Dynamic test status badges in README
- **CI/CD Reports** - Test results in GitHub Actions artifacts
- **PR Comments** - Automated test summaries on pull requests
- **Local HTML Reports** - Developer-friendly test visualization

## Architecture

### Components

1. **GitHub Actions Workflow** (`.github/workflows/test-badges.yml`)
   - Orchestrates test execution across environments
   - Updates badge data via GitHub Gists API
   - Publishes results as PR comments
   - Uploads test artifacts for download

2. **Test Configurations** (`vitest.config.ts` & `vitest.integration.config.ts`)
   - Output to `target/` directory for all reports
   - Multiple output formats (HTML, JSON, JUnit)
   - Coverage threshold enforcement
   - Local HTML reports for developers

## Setup Instructions

### Prerequisites

- GitHub repository with Actions enabled
- Node.js 20+ and pnpm installed
- Vitest configured for testing

### Step 1: Create GitHub Gist for Badge Storage

1. Navigate to https://gist.github.com
2. Create a new **secret** gist named `test-badges.json`
3. Add initial badge template:

```json
{
  "schemaVersion": 1,
  "label": "tests",
  "message": "pending",
  "color": "yellow"
}
```

4. Extract the Gist ID from URL: `https://gist.github.com/USERNAME/GIST_ID`

### Step 2: Configure GitHub Secrets

1. Go to Repository Settings → Secrets and variables → Actions
2. Add new repository secret:
   - Name: `GIST_SECRET`
   - Value: Personal access token with `gist` scope

To create the token:
- GitHub Settings → Developer settings → Personal access tokens
- Generate new token (classic) with `gist` scope
- Copy and save as repository secret

### Step 3: Update Configuration Files

#### Update `.github/workflows/test-badges.yml`

Replace placeholders:
- `YOUR_GIST_ID_HERE` → Your actual Gist ID (3 occurrences)

#### Update `README.md`

Replace badge URL placeholders:
- `YOUR_USERNAME` → Your GitHub username
- `YOUR_GIST_ID` → Your Gist ID

Example:
```markdown
![Unit Tests](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/clayroach/abc123def456/raw/unit-tests.json)
```

## Usage

### Running Tests Locally

```bash
# Standard test execution
pnpm test                    # Run unit tests
pnpm test:integration        # Run integration tests
pnpm test:e2e               # Run E2E tests

# With visual reports
pnpm test:report            # Generate HTML/JSON reports
pnpm test:integration:report # Integration tests with reports
pnpm test:coverage:ui       # Interactive coverage viewer

# Output locations (all in root target/ folder)
# - target/test-results/index.html  (HTML report)
# - target/test-results/results.json (JSON data)
# - target/coverage/index.html      (Coverage report)
```

### Viewing Test Results

#### Local Development

```bash
# Generate and view HTML reports locally
pnpm test:report
open target/test-results/index.html

# View coverage report
pnpm test:coverage
open target/coverage/index.html
```

#### GitHub Actions

1. Navigate to Actions tab in GitHub repository
2. Click on a workflow run
3. Download test artifacts from "Artifacts" section
4. View HTML reports locally after extraction

### CI/CD Integration

The workflow automatically triggers on:
- Push to main branch
- Pull request creation/update
- Manual workflow dispatch

Actions performed:
1. Execute all test suites
2. Update Gist badge data
3. Post results summary as PR comment
4. Upload test artifacts

## Configuration

### Test Configuration in vitest.config.ts

```typescript
{
  outputFile: {
    json: './target/test-results/results.json',
    junit: './target/test-results/junit.xml',
    html: './target/test-results/index.html'
  },
  coverage: {
    reportsDirectory: 'target/coverage',
    thresholds: {
      lines: 60,
      functions: 60,
      branches: 60,
      statements: 60
    }
  }
}
```

### Badge Color Thresholds

- ✅ Green: ≥95% pass rate
- 🟡 Yellow: ≥80% pass rate
- 🔴 Red: <80% pass rate

### Coverage Thresholds

- 🟢 Good: ≥80% coverage
- 🟡 Acceptable: ≥60% coverage
- 🔴 Needs improvement: <60% coverage

## Test Results Schema

### JSON Output Format

```typescript
interface TestResults {
  numTotalTests: number
  numPassedTests: number
  numFailedTests: number
  numSkippedTests: number
  testResults: Array<{
    name: string
    status: 'passed' | 'failed' | 'skipped'
    duration: number
    failureMessages?: string[]
  }>
  coverage?: {
    lines: { pct: number }
    functions: { pct: number }
    branches: { pct: number }
    statements: { pct: number }
  }
}
```

## Troubleshooting

### Issue: Badges Not Updating

**Symptoms**: README badges show outdated or "invalid" status

**Solutions**:
1. Verify GitHub Actions workflow is running successfully
2. Check `GIST_SECRET` is correctly configured
3. Confirm Gist ID matches in workflow and README
4. Review Actions logs for API errors

### Issue: Test Reports Not Generated

**Symptoms**: No HTML/JSON reports after running tests

**Solutions**:
1. Use `pnpm test:report` instead of `pnpm test`
2. Check `target/test-results/` directory exists
3. Verify reporter configuration in `vitest.config.ts`
4. Ensure sufficient disk space for report generation

### Issue: Coverage Reports Missing

**Symptoms**: No coverage data in reports

**Solutions**:
1. Install coverage dependencies: `pnpm add -D @vitest/coverage-v8`
2. Run with coverage flag: `pnpm test:coverage`
3. Check `target/coverage/` directory exists
4. Verify coverage provider in config

## Integration with Development Workflow

### Daily Development

1. Run tests before committing:

```bash
pnpm test:report
```

2. Review HTML report for failures:

```bash
open target/test-results/index.html
```

3. Fix issues and re-run affected suites

### Pull Request Process

1. Push changes to feature branch
2. GitHub Actions runs automatically
3. Review PR comment with test summary
4. Check updated badges in README
5. Address any failures before merge

### Release Process

1. Ensure all badges are green
2. Review coverage trends
3. Archive test reports as release artifacts
4. Tag release with test metrics

## Future Enhancements

- [ ] Historical test data persistence
- [ ] Trend analysis over time
- [ ] Flaky test detection
- [ ] Performance regression alerts
- [ ] Integration with monitoring platform
- [ ] Test impact analysis
- [ ] Automated test selection based on changes

## Related Documentation

- [[notes/testing/strategy|Testing Strategy]]
- [[notes/ci-cd/github-actions|GitHub Actions Configuration]]
- [[notes/design/adr/adr-015-testing-strategy|ADR-015: Multi-Level Testing Strategy]]