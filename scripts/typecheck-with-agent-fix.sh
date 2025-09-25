#!/bin/bash

echo "🔍 Running TypeScript type checking..."

# Run typecheck and capture the exit code
if pnpm typecheck:all; then
    echo "✅ TypeScript checks passed!"
    exit 0
else
    echo ""
    echo "❌ TypeScript or ESLint errors detected!"
    echo ""
    echo "🤖 Automatically invoking effect-ts-optimization-agent..."
    echo ""

    # Create a temporary file with the agent prompt
    cat > /tmp/claude-agent-prompt.txt << 'EOF'
Fix all TypeScript and ESLint errors found by the typecheck:all command.

Focus on:
• Eliminating 'as any' usage and unsafe type assertions
• Fixing Effect-TS anti-patterns (Effect.gen misuse, improper Layer composition)
• Ensuring proper dependency injection with Context and Layer patterns
• Applying TypeScript best practices and null safety
• Resolving ESLint violations while maintaining code functionality

Run comprehensive validation before declaring success:
1. pnpm typecheck:all must pass completely
2. All tests must continue to pass
3. No new ESLint errors introduced

CRITICAL: Do not declare success while any TypeScript or ESLint issues remain.
EOF

    echo "📋 Agent prompt prepared. Please run:"
    echo ""
    echo "  Use the effect-ts-optimization-agent with the following task:"
    echo ""
    cat /tmp/claude-agent-prompt.txt
    echo ""
    echo "Or use the pre-commit bypass if this is urgent:"
    echo "  git commit --no-verify -m \"your message\""
    echo ""

    # Clean up
    rm -f /tmp/claude-agent-prompt.txt

    exit 1
fi