#!/bin/bash
# Generate code from a package note using Copilot

NOTE_FILE=$1
if [ -z "$NOTE_FILE" ]; then
    echo "Error: No note file provided"
    exit 1
fi

# Extract package name from file path
PACKAGE_NAME=$(basename $(dirname "$NOTE_FILE"))
if [ "$PACKAGE_NAME" == "packages" ]; then
    PACKAGE_NAME=$(basename "$NOTE_FILE" .md)
fi

SRC_PATH="src/$PACKAGE_NAME"

echo "🤖 Generating code from note: $NOTE_FILE"
echo "📁 Target directory: $SRC_PATH"
echo ""
echo "═══════════════════════════════════════════════════════"
echo "Instructions for Copilot Chat:"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Copy and paste this prompt into Copilot Chat:"
echo ""
echo "@workspace Read the package specification in $NOTE_FILE and generate a complete implementation in $SRC_PATH with:"
echo "- TypeScript implementation following the documented API"
echo "- Unit tests with at least 80% coverage"
echo "- OpenTelemetry instrumentation as specified"
echo "- Proper error handling and logging"
echo "- JSDoc comments for all public APIs"
echo ""
echo "Press Enter when generation is complete..."
read

echo "✅ Code generation complete for $PACKAGE_NAME"
echo ""
echo "Next steps:"
echo "1. Review the generated code"
echo "2. Run tests: npm test $SRC_PATH"
echo "3. Update documentation if needed: Ctrl+Alt+D"
