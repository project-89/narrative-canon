#!/bin/bash

# Fix import paths in test files after reorganization
# This script will update all import paths in tests/ to point to the correct src/ locations

echo "🔧 Fixing import paths in test files..."

# Function to fix imports in a file
fix_imports() {
    local file="$1"
    echo "  Fixing imports in: $file"
    
    # Calculate depth (number of subdirectories from tests/)
    local rel_path=${file#tests/}
    local depth=$(echo "$rel_path" | tr -cd '/' | wc -c)
    
    # Build relative path back to src/
    local src_path=""
    for ((i=0; i<depth; i++)); do
        src_path="../$src_path"
    done
    src_path="${src_path}../src"
    
    # Replace relative imports with corrected paths
    sed -i '' \
        -e "s|from '\./|from '$src_path/$(dirname "$rel_path")/|g" \
        -e "s|from '\.\./|from '$src_path/|g" \
        -e "s|from '\.\.\/\.\./|from '$src_path/|g" \
        "$file"
}

# Find all test files and fix their imports
find tests -name "*.test.ts" -type f | while read -r file; do
    fix_imports "$file"
done

echo "✅ Import paths fixed in all test files!"
echo ""
echo "🧪 Testing one file to verify..."