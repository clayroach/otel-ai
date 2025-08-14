#!/bin/bash
# Sync all package notes with their code

echo "🔄 Syncing all package notes with code..."
echo ""

PACKAGES_FOUND=0

# Check for packages in src directory
if [ -d "src" ]; then
    for package_dir in src/*/; do
        if [ -d "$package_dir" ]; then
            PACKAGES_FOUND=$((PACKAGES_FOUND + 1))
            package_name=$(basename "$package_dir")
            note_dir="notes/packages/$package_name"
            note_file="$note_dir/package.md"
            
            if [ ! -f "$note_file" ]; then
                echo "📝 Creating note for new package: $package_name"
                mkdir -p "$note_dir"
                cp notes/templates/package-template.md "$note_file"
                sed -i "s/{{name}}/$package_name/g" "$note_file"
                sed -i "s/{{date}}/$(date +%Y-%m-%d)/g" "$note_file"
            fi
            
            echo "📦 Package: $package_name"
            echo "   📄 Note: $note_file"
            echo "   💡 Copilot prompt: @workspace Update $note_file from $package_dir"
            echo ""
        fi
    done
fi

if [ $PACKAGES_FOUND -eq 0 ]; then
    echo "No packages found in src/ directory."
    echo "Creating example package structure..."
    
    # Create example packages
    for package in tracer metrics exporter; do
        note_dir="notes/packages/$package"
        note_file="$note_dir/package.md"
        
        if [ ! -f "$note_file" ]; then
            mkdir -p "$note_dir"
            cp notes/templates/package-template.md "$note_file"
            sed -i "s/{{name}}/$package/g" "$note_file"
            sed -i "s/{{date}}/$(date +%Y-%m-%d)/g" "$note_file"
            echo "Created example note: $note_file"
        fi
    done
fi

echo ""
echo "✅ Sync complete!"
echo ""
echo "To update all notes with current code:"
echo "1. Open Copilot Chat (Ctrl+Shift+I)"
echo "2. Run the update commands shown above for each package"
