# Narrative Canon CLI Usage Guide

## Installation

```bash
npm install -g @narrative/canon
# or for local development
npm link
```

## Commands

### Extract Narrative

Extract narrative structure from a text file and generate visualizations:

```bash
# Basic usage (generates both JSON and HTML)
narrative-canon extract story.txt

# Specify output directory
narrative-canon extract story.txt -o ./output

# Use mock LLM (no API key required)
narrative-canon extract story.txt --use-mock

# JSON output only
narrative-canon extract story.txt -f json

# HTML visualization only
narrative-canon extract story.txt -f html

# With custom chunk size for large documents
narrative-canon extract large-novel.txt --chunk-size 15000

# Verbose output
narrative-canon extract story.txt --verbose
```

### Quick Analysis

Get a quick analysis of a narrative file without full extraction:

```bash
narrative-canon analyze story.txt
```

This shows:
- Character count and word count
- Number of paragraphs and sentences
- Detected dialogue lines
- Temporal and location markers
- Likely character names

### Serve Visualizations

Start a local web server to view HTML visualizations:

```bash
# Serve from output directory
narrative-canon serve ./output

# Custom port
narrative-canon serve ./output -p 3000
```

## Environment Variables

Set your Gemini API key:

```bash
export GEMINI_API_KEY=your-api-key-here
```

Or create a `.env` file:

```
GEMINI_API_KEY=your-api-key-here
```

## Output Files

After extraction, you'll find:

- `narrative.json` - Complete narrative structure
- `graph.json` - Temporal graph representation
- `narrative-visualization.html` - Interactive visualization

## HTML Visualization Features

The generated HTML file includes:

1. **Summary Dashboard** - Overview statistics
2. **Timeline View** - Chronological event visualization
3. **Character Grid** - All detected characters with descriptions
4. **Scene List** - Sequential scene breakdown
5. **Relationship Graph** - Interactive character relationships
6. **Temporal Graph** - State changes over time

## Example Workflow

```bash
# 1. Extract narrative from a document
narrative-canon extract /path/to/project89-story.txt -o ./project89-output

# 2. View the results
narrative-canon serve ./project89-output

# 3. Open browser to http://localhost:8080/narrative-visualization.html
```

## Large Document Handling

For documents larger than ~10,000 characters:

```bash
# The CLI automatically chunks large documents
narrative-canon extract war-and-peace.txt --chunk-size 20000 --verbose
```

The chunking system:
- Splits documents into overlapping chunks
- Processes each chunk separately
- Merges results intelligently
- Deduplicates entities and relationships

## Tips

1. **API Keys**: Without an API key, use `--use-mock` for testing
2. **Performance**: Larger documents take longer (expect ~10-30s per 10k characters)
3. **Quality**: Real LLMs (Gemini) provide better extraction than mock mode
4. **Formats**: The system works best with narrative text (stories, scripts, novels)