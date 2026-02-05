#!/bin/bash

# Project cleanup script for Narrative Canon
# Removes redundant build configs and organizes output directories

echo "🧹 Cleaning up Narrative Canon project..."

# Remove redundant build configuration (we use esbuild)
if [ -f "rollup.config.js" ]; then
    echo "📦 Removing redundant rollup.config.js (using esbuild)"
    rm rollup.config.js
fi

# Remove redundant lock file (keep npm, remove pnpm)
if [ -f "pnpm-lock.yaml" ]; then
    echo "🔒 Removing pnpm-lock.yaml (using npm)"
    rm pnpm-lock.yaml
fi

# Update .gitignore to include output directories
echo "📝 Updating .gitignore for output directories..."
cat >> .gitignore << 'EOF'

# Output directories
cli-test-output/
example-output/
narrative-output/
output/
samples/*/output/
samples/*-output/

# Temporary files
*.tmp
*.temp
.DS_Store

# IDE files
.vscode/settings.json
.idea/

EOF

echo "✅ Project cleanup complete!"
echo ""
echo "📁 New organization:"
echo "  • Documentation moved to docs/ subdirectories"
echo "  • Utility scripts moved to scripts/"
echo "  • Redundant configs removed"
echo "  • Output directories added to .gitignore"