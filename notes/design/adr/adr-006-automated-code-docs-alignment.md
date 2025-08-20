# ADR-006: Automated Code-Documentation Alignment

## Status

Proposed

## Context

In a documentation-driven development project with rapid AI-assisted code generation, maintaining alignment between design documents, notes, and actual implementation becomes critical. Manual synchronization is error-prone and contradicts the automation-first philosophy.

## Decision

Implement **daily automated synchronization** between code and documentation using GitHub Actions and the Claude Code Code-to-Docs Sync Agent.

## Implementation Strategy

### Daily GitHub Action Workflow
```yaml
name: Code-Documentation Alignment
on:
  schedule:
    - cron: '0 2 * * *'  # Run at 2 AM UTC daily
  workflow_dispatch:      # Allow manual triggering
  
jobs:
  sync-code-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Claude Code
        run: |
          npm install -g @anthropic/claude-code
          echo "$CLAUDE_API_KEY" > ~/.claude-api-key
      - name: Run Code-to-Docs Sync Agent
        run: |
          claude-code --agent code-to-docs-sync-agent \
            --prompt "Analyze all packages in src/ and update corresponding notes in notes/packages/"
      - name: Create PR if changes detected
        run: |
          if [[ -n $(git status --porcelain) ]]; then
            git config user.name "Claude Code Bot"
            git config user.email "claude-bot@anthropic.com"
            git checkout -b "automated-docs-sync-$(date +%Y%m%d)"
            git add notes/
            git commit -m "Automated code-documentation sync
            
            🤖 Generated with Claude Code Code-to-Docs Sync Agent
            
            Co-Authored-By: Claude <noreply@anthropic.com>"
            git push origin HEAD
            gh pr create --title "Daily Code-Documentation Sync" \
              --body "Automated synchronization of implementation with design documents"
          fi
```

### Sync Scope and Strategy

#### What Gets Synchronized
1. **Package Documentation** - Update `notes/packages/*/package.md` with current implementations
2. **API Documentation** - Generate API docs from TypeScript interfaces
3. **Architecture Decisions** - Flag mismatches between ADRs and implementation
4. **Configuration Files** - Sync package.json scripts with documented workflows

#### Bidirectional Sync Strategy
```typescript
interface SyncOperation {
  direction: 'code-to-docs' | 'docs-to-code' | 'bidirectional'
  source: string
  target: string
  confidence: 'high' | 'medium' | 'low'
  requiresReview: boolean
}
```

### Integration with Development Workflow

#### Daily Sync Process
1. **2 AM UTC**: GitHub Action triggers automatically
2. **Analysis Phase**: Code-to-Docs Sync Agent analyzes all packages
3. **Change Detection**: Identifies mismatches between code and documentation
4. **Update Generation**: Updates documentation to match implementation
5. **PR Creation**: Creates pull request for review if changes detected

#### Manual Sync Options
```bash
# Manual sync for specific package
pnpm sync:docs:storage

# Full project sync
pnpm sync:docs:all

# Sync specific direction
pnpm sync:code-to-docs
pnpm sync:docs-to-code
```

## Agent Configuration

### Code-to-Docs Sync Agent Prompt
```markdown
You are the Code-to-Docs Sync Agent. Analyze the implementation in src/ and update corresponding documentation in notes/packages/ to reflect the current state.

Focus Areas:
1. **API Changes** - Update interface documentation
2. **Configuration** - Sync package.json with documented scripts  
3. **Architecture** - Flag any deviations from ADRs
4. **Implementation Status** - Update completion status in package docs

Output Format:
- Updated markdown files in notes/packages/
- Summary of changes made
- Flagged inconsistencies requiring human review
```

### Sync Rules and Priorities

#### High Confidence (Auto-merge)
- **API documentation** generated from TypeScript interfaces
- **Package.json scripts** alignment with documented workflows
- **Import/export statements** reflecting actual code structure

#### Medium Confidence (PR for review)
- **Architecture pattern** documentation updates
- **Configuration changes** that affect multiple packages
- **New feature documentation** based on recent code additions

#### Low Confidence (Flag for manual review)
- **Design decision changes** that contradict ADRs
- **Breaking changes** that affect public APIs
- **Security-related** configuration modifications

## Benefits

### Consistency Assurance
- **Always up-to-date** documentation reflecting current implementation
- **Catch drift** between design intentions and actual code
- **Maintain quality** of documentation-driven development

### Development Efficiency
- **Automated maintenance** of documentation reduces manual overhead
- **Clear change tracking** through PR-based updates
- **Early detection** of architectural inconsistencies

### Project Integrity
- **Living documentation** that accurately reflects the system
- **Audit trail** of how implementation evolves from design
- **Quality gates** preventing unchecked architectural drift

## Risk Mitigation

### Over-Automation Protection
- **Human review required** for medium/low confidence changes
- **Manual override** capabilities for sync decisions
- **Rollback procedures** for incorrect automated updates

### Security Considerations
- **Limited API key scope** for GitHub Actions
- **Secure storage** of Claude API credentials
- **Audit logging** of all automated changes

### Quality Assurance
- **Sync validation** ensures changes improve documentation quality
- **Conflict resolution** for competing documentation sources
- **Version control** maintains full history of sync operations

## Success Metrics

1. **Documentation Accuracy**: >95% alignment between code and docs
2. **Sync Frequency**: Daily successful synchronization
3. **Human Intervention**: <10% of syncs require manual review
4. **Developer Satisfaction**: Documentation always reflects current state

## Implementation Timeline

### Phase 1: Basic GitHub Action (Week 2)
- Set up daily workflow with Code-to-Docs Sync Agent
- Implement PR creation for detected changes
- Test with storage package documentation

### Phase 2: Bidirectional Sync (Week 3)  
- Add docs-to-code sync capabilities
- Implement confidence-based automation rules
- Expand to all packages

### Phase 3: Advanced Features (Week 4)
- Add architecture drift detection
- Implement automatic ADR compliance checking
- Create dashboard for sync status and metrics

## Integration Points

### GitHub Actions
- **Scheduled workflow** for daily synchronization
- **Manual triggers** for on-demand sync
- **PR automation** for change management

### Claude Code Integration
- **Agent orchestration** for complex sync operations
- **Intelligent analysis** of code-documentation mismatches
- **Quality-driven updates** maintaining documentation standards

### Development Workflow
- **Pre-commit hooks** for local sync validation
- **CI/CD integration** ensuring sync before deployment
- **Developer tools** for manual sync operations when needed

This automation ensures that the documentation-driven development approach remains viable at scale, with the AI handling the routine task of keeping everything aligned.