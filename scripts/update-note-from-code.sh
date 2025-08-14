#!/bin/bash
# Update package note from code changes

CODE_DIR=$1
if [ -z "$CODE_DIR" ]; then
    echo "Error: No directory provided"
    exit 1
fi

PACKAGE_NAME=$(basename "$CODE_DIR")
NOTE_FILE="notes/packages/$PACKAGE_NAME/package.md"

if [ ! -f "$NOTE_FILE" ]; then
    echo "Creating new package note for $PACKAGE_NAME..."
    mkdir -p "notes/packages/$PACKAGE_NAME"
    cp notes/templates/package-template.md "$NOTE_FILE"
    sed -i "s/{{name}}/$PACKAGE_NAME/g" "$NOTE_FILE"
    sed -i "s/{{date}}/$(date +%Y-%m-%d)/g" "$NOTE_FILE"
fi

echo "📝 Updating note from code: $CODE_DIR"
echo "📄 Target note: $NOTE_FILE"
echo ""
echo "═══════════════════════════════════════════════════════"
echo "Instructions for Copilot Chat:"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Copy and paste this prompt into Copilot Chat:"
echo ""
echo "@workspace Analyze the implementation in $CODE_DIR and update $NOTE_FILE with:"
echo "- Current API surface with TypeScript signatures"
echo "- Implementation details and architecture"
echo "- Dependencies (both internal and external)"
echo "- OpenTelemetry instrumentation details (spans, metrics, context)"
echo "- Test coverage information"
echo "- Recent changes since last update"
echo ""
echo "Press Enter when update is complete..."
read

echo "✅ Note update complete for $PACKAGE_NAME"
