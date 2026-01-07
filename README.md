<p align="center">
	<h1 align="center"><b>Scrape AI 🔎</b></h1>
<p align="center">
  Extract and summarize web content using AI. Built with Puppeteer for web scraping and Google Gemini for intelligent summarization.
</p>
<br/>
</p>


## Features

- Scrapes websites and pulls out clean, readable content
- Creates AI summaries in different styles and lengths
- Supports multiple URLs at once and lets you compare results
- Can follow internal links to dig deeper into related content
- Easy to extend with plugins (like sentiment, keywords, readability)
- Handles common issues like
  - **Rate limiting** - retries automatically with smart delays
  - **Timeouts** - configurable limits with retry support
  - **Invalid URLs** - clear validation and helpful error messages
  - **Empty pages** - detects pages with little or no useful content
  - **Network problems** - retries safely when things go wrong

## Quick Start

```bash
# Install dependencies
npm install

# Copy the example environment file and add your API key
cp .env.example .env
# Then edit .env and add your GOOGLE_GENERATIVE_AI_API_KEY

# Summarize a single page
node dist/index.js https://example.com

# Get a short summary with metadata
node dist/index.js https://example.com --length short --metadata

# Process multiple URLs from a file
node dist/index.js --batch urls.txt --comparative
```

## Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Get a Google Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
4. Create a `.env` file: `cp .env.example .env`
5. Add your API key to the `.env` file: `GOOGLE_GENERATIVE_AI_API_KEY=your-key-here`

## Usage

### Basic Usage

```bash
# Simple summary
node dist/index.js https://news.example.com/article

# Custom length and format
node dist/index.js https://blog.example.com --length long --format bullets

# Include page metadata
node dist/index.js https://docs.example.com --metadata

# Save to file
node dist/index.js https://example.com --save my-summary
```

### Batch Processing

Create a text file with URLs (one per line):

```
https://example.com/page1
https://example.com/page2
https://example.com/page3
```

Then process them:

```bash
# Basic batch processing
node dist/index.js --batch urls.txt

# With comparative analysis
node dist/index.js --batch urls.txt --comparative

# Save results
node dist/index.js --batch urls.txt --comparative --save batch-report
```

### Advanced Features

```bash
# Follow internal links (up to 5)
node dist/index.js https://example.com --follow 5

# Use content analysis plugins
node dist/index.js https://example.com --plugins sentiment-analyzer,keyword-extractor

# Custom retry settings
node dist/index.js https://example.com --max-retries 5 --retry-delay 3000
```

## Command Line Options

| Option | Description | Example |
|--------|-------------|---------|
| `--length` | Summary length: `short`, `medium`, `long` | `--length short` |
| `--format` | Output format: `paragraphs`, `bullets`, `json` | `--format bullets` |
| `--metadata` | Include page title, description, URL | `--metadata` |
| `--save` | Save output to file | `--save report` |
| `--batch` | Process URLs from file | `--batch urls.txt` |
| `--comparative` | Generate comparative analysis (batch only) | `--comparative` |
| `--follow` | Follow N internal links | `--follow 3` |
| `--plugins` | Enable analysis plugins | `--plugins sentiment-analyzer,keywords` |
| `--max-retries` | Maximum retry attempts (0-10) | `--max-retries 5` |
| `--retry-delay` | Delay between retries in ms (100-30000) | `--retry-delay 2000` |
| `--output` | Output format: `text`, `json` | `--output json` |

## Output and File Storage

All summaries are automatically saved to the `summaries/` directory when using the `--save` flag:

```bash
# Save text summary
node dist/index.js https://example.com --save my-summary
# Creates: summaries/my-summary.txt

# Save JSON output
node dist/index.js https://example.com --output json --save my-summary
# Creates: summaries/my-summary.json

# Save batch results
node dist/index.js --batch urls.txt --save batch-results
# Creates: summaries/batch-results.txt
```

The `summaries/` directory is created automatically if it doesn't exist. File extension (`.txt` or `.json`) is added automatically based on the output format.

## Available Plugins

Plugins enable additional content analysis beyond basic summarization:

- **sentiment-analyzer**: Analyzes emotional tone and sentiment of content
  - Returns: sentiment (positive/negative/neutral), score, word counts
  
- **keyword-extractor**: Extracts and ranks the most important keywords
  - Returns: top keywords with frequency scores, total/unique word counts
  
- **readability-scorer**: Measures reading difficulty and complexity
  - Returns: readability scores, estimated reading time, complexity level

### Using Plugins

```bash
# Single plugin
node dist/index.js https://example.com --plugins sentiment-analyzer

# Multiple plugins (comma-separated)
node dist/index.js https://example.com --plugins sentiment-analyzer,keyword-extractor,readability-scorer

# With JSON output to see full analysis
node dist/index.js https://example.com --plugins keyword-extractor --output json
```

Plugin results are displayed in the output:
- **Text output**: Shows under "=== Plugin Analysis ===" section
- **JSON output**: Included in the `analysis` and `tags` fields

## Output Examples

### Text Output
```
--- Website Summary ---

Title: Example Article
URL: https://example.com/article
Date: 1/7/2026, 10:30:00 PM

This article discusses the latest developments in web scraping technology...

=== Plugin Analysis ===

sentiment-analyzer:
{
  "sentiment": "positive",
  "score": 0.8,
  "positiveWords": 15,
  "negativeWords": 2
}

Tags: positive

-----------------------
```

### JSON Output Format
```json
{
  "url": "https://example.com",
  "timestamp": "2026-01-07T20:15:30.123Z",
  "processingTime": 5234,
  "metadata": {
    "title": "Example Article",
    "description": "Article description here",
    "contentLength": 2500
  },
  "summary": {
    "content": "The article discusses...",
    "length": "short",
    "keyPoints": [
      "First key point from summary",
      "Second key point from summary"
    ]
  },
  "analysis": {
    "sentiment-analyzer": {
      "sentiment": "positive",
      "score": 0.8,
      "positiveWords": 15,
      "negativeWords": 2
    },
    "keyword-extractor": {
      "keywords": [
        {"word": "technology", "count": 12, "frequency": 0.048},
        {"word": "development", "count": 8, "frequency": 0.032}
      ],
      "totalWords": 2500,
      "uniqueWords": 850
    }
  },
  "tags": ["technology", "development", "positive"],
  "status": "success"
}
```

## Configuration

The application uses centralized configuration in `src/config.ts`:

```typescript
export const CONFIG = {
  AI: {
    MAX_CHUNK_CHARS: 32000,        // Max characters per AI request
    RATE_LIMIT_REQUESTS: 2,        // Requests per window
    RATE_LIMIT_WINDOW: 1000,       // Rate limit window (ms)
  },
  BROWSER: {
    NAVIGATION_TIMEOUT: 60000,     // Page load timeout (ms)
    VIEWPORT: { width: 1280, height: 720 },
  },
  PROCESSING: {
    BATCH_DELAY: 1000,             // Delay between batch items (ms)
    MEMORY_REFRESH_INTERVAL: 10,   // Pages before browser refresh
  }
};
```

## Architecture

```
src/
├── index.ts          # Main CLI application
├── ai.ts             # AI summarization logic
├── browser.ts        # Web scraping with Puppeteer
├── config.ts         # Centralized configuration
├── output.ts         # Output formatting and file saving
├── types.ts          # TypeScript type definitions
├── utils.ts          # Utility functions
└── plugins/          # Plugin system
    ├── index.ts      # Plugin exports
    ├── manager.ts    # Plugin management
    ├── types.ts      # Plugin type definitions
    └── processors/   # Built-in processors
        ├── sentiment.ts
        ├── keywords.ts
        └── readability.ts
```

## Troubleshooting

**"No meaningful content found"**: The page might be JavaScript-heavy or have unusual structure. Try a different URL or check if the site blocks automated access.

**Rate limiting errors**: Reduce the batch size or increase delays between requests.

**Memory issues**: The browser refreshes automatically every 10 pages during batch processing. For very large batches, consider splitting into smaller files.

**API key issues**: Make sure your Gemini API key is set correctly and has sufficient quota.
