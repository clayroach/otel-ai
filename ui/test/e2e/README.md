# E2E Test Scenarios for Future Automation

## Overview

This document outlines comprehensive E2E test scenarios that should be automated using Playwright to ensure robust UI validation and catch "it works on the backend" issues early.

## Current E2E Tests ✅

### Model Selection & State Management
- ✅ **User Issue Reproduction** (`user-issue-reproduction.spec.ts`)
  - Reproduces exact user issue: "same number (4) insights" across models
  - Validates different insights appear for Claude, GPT, Llama models
  - Captures network requests and UI state for debugging
  - Screenshots and detailed logging for issue diagnosis

- ✅ **Quick Validation** (`quick-validation.spec.ts`)
  - Basic page load and element presence validation
  - Model selector dropdown functionality
  - Essential UI components are visible and interactive

- ✅ **Model Selection Behavior** (`model-selection.spec.ts`)
  - Comprehensive model switching validation
  - Different insights per model verification
  - Rapid model switching scenarios
  - Network request debugging and validation

## Future E2E Test Scenarios 📋

### 1. Time Range & Data Selection
- **Time Range Picker Functionality**
  - Validate preset selections (Last Hour, Last 3 Hours, etc.)
  - Custom time range selection
  - Time range validation (prevent future dates, invalid ranges)
  - Time range persistence across page refreshes

- **Contextual Data Selection** (ADR-007)
  - Event-driven data selection beyond time ranges
  - Service-specific filtering
  - Operation-specific filtering
  - Dynamic time window adjustments

### 2. Analysis Results Validation
- **Insights Display & Content**
  - Verify insight cards render correctly
  - Validate severity color coding (critical=red, warning=orange, info=blue)
  - Check insight type categorization (performance, reliability, architecture)
  - Evidence formatting and readability

- **Results Metadata Verification**
  - Analysis summary shows correct span counts
  - Processing time and token usage display
  - Confidence scores and visualization
  - Model attribution (which model generated results)

### 3. Service Integration & Health
- **Real Service vs Mock Mode**
  - Toggle between real and mock service
  - Service health indicator updates
  - Graceful degradation when service unavailable
  - Error handling and user feedback

- **Streaming Analysis**
  - Real-time topology analysis stream
  - Stream content updates and formatting
  - Stream interruption and recovery
  - Loading states and progress indicators

### 4. Data Visualization & Charts
- **Topology Visualization**
  - Service topology graph rendering
  - Interactive node/edge interactions
  - Service dependency visualization
  - Critical path highlighting

- **Metrics Dashboard Integration**
  - Chart rendering and data binding
  - Interactive chart controls
  - Responsive design across screen sizes
  - Chart export functionality

### 5. Error Handling & Edge Cases
- **Network Error Scenarios**
  - Backend service downtime
  - Timeout handling for long-running analysis
  - Partial data scenarios
  - Invalid API responses

- **Data Edge Cases**
  - Empty datasets (0 spans)
  - Large datasets (100k+ spans)
  - Malformed telemetry data
  - Missing service names or attributes

### 6. User Experience & Accessibility
- **Responsive Design**
  - Mobile device compatibility
  - Tablet view optimization
  - Desktop multi-monitor scenarios
  - Browser zoom levels (50%-200%)

- **Accessibility Compliance**
  - Screen reader compatibility
  - Keyboard navigation
  - Color contrast validation
  - Focus indicators and tab order

### 7. Performance & Load Testing
- **UI Performance**
  - Large insight set rendering performance
  - Memory usage during long sessions
  - CPU usage during analysis
  - Bundle size and load time optimization

- **Concurrent User Scenarios**
  - Multiple browser tabs/windows
  - Simultaneous analysis requests
  - Resource contention handling
  - Session management and cleanup

### 8. Integration Testing
- **OpenTelemetry Demo Integration**
  - End-to-end trace ingestion to analysis
  - Multiple service scenarios (15+ services)
  - Real-world telemetry pattern validation
  - Cross-service dependency detection

- **Data Pipeline Validation**
  - OTLP → ClickHouse → Analysis → UI flow
  - Data consistency across pipeline stages
  - Real-time vs batch processing modes
  - Schema evolution and migration handling

## Test Implementation Priority

### High Priority 🔥
1. **Time Range & Data Selection** - Core functionality users interact with daily
2. **Analysis Results Validation** - Ensures insights are displayed correctly
3. **Service Integration & Health** - Critical for production reliability

### Medium Priority ⚠️
4. **Error Handling & Edge Cases** - Important for user experience
5. **Data Visualization & Charts** - Visual correctness validation
6. **User Experience & Accessibility** - Broader user base support

### Low Priority 📌
7. **Performance & Load Testing** - Optimization and scale validation
8. **Integration Testing** - Comprehensive system validation

## Test Framework Enhancements

### Browser Coverage
- **Desktop**: Chrome, Firefox, Safari, Edge
- **Mobile**: Safari iOS, Chrome Android
- **Version Support**: Latest 2 major versions

### Test Data Management
- **Fixture Management**: Standardized test data sets
- **Mock Service Integration**: Consistent mock responses
- **Database Seeding**: Reproducible test data states
- **Cleanup Automation**: Test isolation and cleanup

### Reporting & Monitoring
- **Visual Regression Testing**: Screenshot comparison
- **Performance Metrics**: Load time, render time tracking
- **Test Result Analytics**: Success rate, failure patterns
- **CI/CD Integration**: Automated test execution on PRs

## Implementation Notes

### Test Organization
```
src/ai-analyzer/test/e2e/
├── core/                    # Core functionality tests
│   ├── model-selection.spec.ts
│   ├── time-range.spec.ts
│   └── analysis-results.spec.ts
├── integration/             # Cross-system integration tests
│   ├── otel-demo.spec.ts
│   └── data-pipeline.spec.ts
├── edge-cases/             # Error scenarios and edge cases
│   ├── network-errors.spec.ts
│   └── data-edge-cases.spec.ts
├── performance/            # Performance and load tests
│   └── load-testing.spec.ts
├── accessibility/          # A11y compliance tests
│   └── a11y-validation.spec.ts
└── fixtures/               # Shared test data and utilities
    ├── test-data.ts
    └── test-helpers.ts
```

### Best Practices
- **Page Object Model**: Encapsulate UI interactions
- **Data-driven Tests**: Parameterized test scenarios
- **Retry Logic**: Handle flaky network conditions
- **Parallel Execution**: Optimize test suite execution time
- **Environment Isolation**: Clean state for each test run

This comprehensive test suite will ensure robust UI validation and catch issues before they reach users, supporting the project's goal of maintaining high quality during rapid development cycles.