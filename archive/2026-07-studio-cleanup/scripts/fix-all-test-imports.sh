#!/bin/bash

# Comprehensive script to fix all test import paths

echo "🔧 Fixing all test import paths systematically..."

# First, clean up any existing bad paths
echo "  Cleaning up malformed paths..."
find tests -name "*.test.ts" -exec sed -i '' \
    -e 's|/src/src/|/src/|g' \
    -e 's|/\.\./src|/src|g' \
    {} \;

# Now set correct paths based on file location
echo "  Setting correct import paths..."

# For tests at root level (tests/*.test.ts)
for file in tests/*.test.ts; do
    if [ -f "$file" ]; then
        echo "    Fixing root level: $file"
        sed -i '' \
            -e "s|from '\.\./src/|from '../src/|g" \
            -e "s|from '\./src/|from '../src/|g" \
            "$file"
    fi
done

# For tests in subdirectories (tests/*/*)
find tests -mindepth 2 -name "*.test.ts" | while read -r file; do
    echo "    Fixing: $file"
    
    # Count the depth
    rel_path=${file#tests/}
    depth=$(echo "$rel_path" | tr -cd '/' | wc -c)
    
    # Create the correct relative path to src
    prefix=""
    for ((i=0; i<=depth; i++)); do
        prefix="../$prefix"
    done
    
    # Apply the fix
    sed -i '' \
        -e "s|from '\.\./\.\./src/|from '${prefix}src/|g" \
        -e "s|from '\.\./src/|from '${prefix}src/|g" \
        -e "s|from '\./|from '${prefix}src/$(dirname "$rel_path")/|g" \
        "$file"
done

echo "✅ All test import paths fixed!"

# Test one file to verify
echo "🧪 Testing narrative-git imports..."
grep "from.*src" tests/git/narrative-git.test.ts | head -3