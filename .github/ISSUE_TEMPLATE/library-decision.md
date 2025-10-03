---
name: Library/Technical Decision
about: Document a library choice or technical approach decision for a feature
title: '[DECISION] '
labels: type:decision
assignees: ''
---

# [Library/Approach Name] Decision: [Brief Title]

## Executive Summary

**Recommendation: [Chosen Option]**

[1-2 sentence summary of the recommendation and key reasoning]

## Quick Comparison Table

| Feature | Option A | Option B |
|---------|----------|----------|
| **Popularity** | [downloads/stars] | [downloads/stars] |
| **Maintenance** | [status] | [status] |
| **Bundle Size** | [size] | [size] |
| **API Style** | [description] | [description] |
| **TypeScript** | [support level] | [support level] |
| **Key Feature 1** | [assessment] | [assessment] |
| **Key Feature 2** | [assessment] | [assessment] |
| **Learning Curve** | [assessment] | [assessment] |

## Detailed Analysis

### 1. API Design & Developer Experience

#### Option A
```typescript
// Example usage
```

**Pros:**
- ✅
- ✅

**Cons:**
- ❌
- ❌

#### Option B
```typescript
// Example usage
```

**Pros:**
- ✅
- ✅

**Cons:**
- ❌
- ❌

### 2. [Key Consideration 1]
<!-- e.g., TypeScript Support, Performance, Integration -->

#### Option A
[Analysis]

**Rating:** ⭐⭐⭐⭐⭐ (X/5)

#### Option B
[Analysis]

**Rating:** ⭐⭐⭐⭐⭐ (X/5)

### 3. [Key Consideration 2]
<!-- e.g., Bundle Size, Maintenance, Community -->

[Comparative analysis]

**Verdict:** [Which option is better for this consideration]

### 4. Integration with Existing Code

**For [Specific Use Case]:**

[Analysis of how each option fits with existing codebase]

**Option A advantages:**
1.
2.

**Option B advantages:**
1.
2.

## Recommendation

### Choose [Option A] if:
✅ [Criterion 1]
✅ [Criterion 2]
✅ [Criterion 3]

### Choose [Option B] if:
⚠️ [Criterion 1]
⚠️ [Criterion 2]
⚠️ [Criterion 3]

## Final Recommendation

**Use [Chosen Option]** because:

1. **[Key Reason 1]:** [Explanation]
2. **[Key Reason 2]:** [Explanation]
3. **[Key Reason 3]:** [Explanation]

[Any trade-offs or considerations to be aware of]

## Implementation Guide

### Getting Started

```bash
# Installation
pnpm add [package-name]
```

### Basic Usage Example

```typescript
// Minimal example showing the recommended approach
```

### Integration Points

[List key files/components that will use this]

## References

- [Documentation](https://example.com)
- [GitHub Repository](https://github.com/...)
- Related Feature: #
- Related ADR: #

## Decision Checklist

- [ ] Both options thoroughly evaluated
- [ ] Code examples tested
- [ ] Bundle size impact assessed
- [ ] TypeScript compatibility verified
- [ ] Team consensus achieved
- [ ] Migration path documented (if applicable)
