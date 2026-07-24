#!/bin/bash

# Simple script to fix the most common import patterns in test files

echo "🔧 Fixing import paths in test files..."

# Fix imports for files directly in tests/ (depth 0)
echo "  Fixing root level test imports..."
find tests -maxdepth 1 -name "*.test.ts" -exec sed -i '' \
    -e "s|from '\./|from '../src/|g" \
    -e "s|from '\.\./|from '../src/|g" \
    {} \;

# Fix imports for files in tests/subdir/ (depth 1)
echo "  Fixing depth 1 test imports..."
find tests -mindepth 2 -maxdepth 2 -name "*.test.ts" -exec sed -i '' \
    -e "s|from '\./|from '../../src/|g" \
    -e "s|from '\.\./|from '../../src/|g" \
    {} \;

# Fix imports for files in tests/subdir/subdir/ (depth 2)
echo "  Fixing depth 2 test imports..."
find tests -mindepth 3 -maxdepth 3 -name "*.test.ts" -exec sed -i '' \
    -e "s|from '\./|from '../../../src/|g" \
    -e "s|from '\.\./|from '../../../src/|g" \
    {} \;

echo "✅ Basic import fixes complete!"