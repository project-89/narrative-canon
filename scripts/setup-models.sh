#!/bin/bash

# Setup script for Timeline Warfare with Gemini 2.5 models
# Run this to configure your environment for maximum quality extraction

echo "🚀 Timeline Warfare - Gemini 2.5 Model Setup"
echo "============================================="
echo ""

# Check if API key is set
if [ -z "$GOOGLE_AI_API_KEY" ] && [ -z "$GEMINI_API_KEY" ]; then
    echo "⚠️  No Gemini API key found in environment"
    echo ""
    echo "To use the latest Gemini 2.5 models, you need an API key:"
    echo "1. Get a free API key at: https://ai.google.dev/"
    echo "2. Set it in your environment:"
    echo "   export GOOGLE_AI_API_KEY='your-api-key-here'"
    echo ""
    echo "Without an API key, the system will use mock data for demonstration."
    echo ""
else
    echo "✅ API key found in environment"
    echo ""
fi

# Model configuration options
echo "🤖 Model Configuration Options:"
echo ""
echo "DEFAULT (Recommended):"
echo "  - Uses gemini-2.5-pro-preview-05-06 - THE MOST POWERFUL MODEL"
echo "  - Best entity classification and relationship detection"
echo "  - Maximum quality for complex narrative analysis"
echo ""
echo "FAST MODE:"
echo "  - Uses gemini-2.5-flash-preview-05-20 for speed"
echo "  - Still very high quality, just faster"
echo "  - Enable with: export GEMINI_FAST_MODE=true"
echo ""

# Check current configuration
if [ "$GEMINI_FAST_MODE" = "true" ]; then
    echo "🏃 Current Mode: FAST (gemini-2.5-flash-preview-05-20)"
else
    echo "🎯 Current Mode: DEFAULT (gemini-2.5-pro-preview-05-06)"
fi

echo ""
echo "🎮 Ready to run Timeline Warfare!"
echo "Commands:"
echo "  npm run build                          # Build the project"
echo "  node dist/timeline-warfare.js         # Play the game"
echo "  node generate-timeline-visualization.js # Generate visualizations"
echo ""

# Optional: Set fast mode if requested
if [ "$1" = "--fast" ]; then
    echo "🏃 Enabling FAST MODE for this session..."
    export GEMINI_FAST_MODE=true
    echo "   GEMINI_FAST_MODE=true"
    echo ""
fi

# Show environment summary
echo "📊 Environment Summary:"
echo "  API Key: $([ -n "$GOOGLE_AI_API_KEY" ] || [ -n "$GEMINI_API_KEY" ] && echo 'SET' || echo 'NOT SET')"
echo "  Fast Mode: $([ "$GEMINI_FAST_MODE" = "true" ] && echo 'ENABLED' || echo 'DISABLED')"
echo "  Model: $([ "$GEMINI_FAST_MODE" = "true" ] && echo 'gemini-2.5-flash-preview-05-20' || echo 'gemini-2.5-pro-preview-05-06')"
echo ""