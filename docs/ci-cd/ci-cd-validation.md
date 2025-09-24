# CI/CD Pipeline Test

This file tests the comprehensive CI/CD pipeline including:

## ✅ Workflows Being Tested

### 1. Never Break Main Pipeline
- Quick validation (TypeScript, ESLint, Prettier, unit tests)
- Full stack testing with Docker services
- Security and dependency scanning
- Build validation and Docker container builds
- Main branch protection gate

### 2. Claude Code Integration
- Automated PR review on pull request creation
- @claude mention responses in comments
- Agent-driven automation workflows
- Documentation sync automation

### 3. Branch Protection Rules
- PR requirements validation
- Conventional commit format checking
- Branch naming convention enforcement
- Required status checks

## 🧪 Test Cases

### Test 1: Basic Pipeline
This PR should trigger all the basic validation checks:
- ✅ TypeScript compilation
- ✅ ESLint code quality
- ✅ Prettier formatting
- ✅ Unit tests

### Test 2: Infrastructure Testing
The pipeline should:
- ✅ Start Docker services (ClickHouse, MinIO, OTel Collector)
- ✅ Run database migrations
- ✅ Execute integration tests
- ✅ Run E2E tests with Playwright
- ✅ Validate OpenTelemetry demo integration
- ✅ Clean up services

### Test 3: Security Scanning
- ✅ Audit dependencies for vulnerabilities
- ✅ Scan for secrets in code
- ✅ Check for outdated dependencies

### Test 4: Build Validation
- ✅ Generate protobuf definitions
- ✅ Build application successfully
- ✅ Validate Docker builds
- ✅ Test production deployment

### Test 5: Claude Code Integration
- When this PR is created, Claude should automatically review it
- Comments with @claude should trigger Claude responses
- Agent workflows should be available for automation

## 📋 Expected Behavior

1. **Immediate**: Quick validation should run and pass
2. **Full Pipeline**: All comprehensive tests should execute
3. **Claude Review**: Automated code review should be posted
4. **Protection**: PR should be blocked if any checks fail
5. **Success**: All green checks should allow merge to main

## 🎯 Success Criteria

- [ ] All GitHub Actions workflows execute successfully
- [ ] No red X marks on any required checks
- [ ] Claude Code provides automated review
- [ ] PR meets all requirements (title, branch name, description)
- [ ] Ready to merge with confidence that main branch is protected

This test validates our "Never Break Main" philosophy with comprehensive automation!