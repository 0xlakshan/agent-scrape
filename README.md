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

export GEMINI_API_KEY="your-api-key-here"

# Summarize a single page
node src/index.js https://example.com

# Get a short summary with metadata
node src/index.js https://example.com --length short --metadata

# Process multiple URLs from a file
node src/index.js --batch urls.txt --comparative
```

## Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Get a Google Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
4. Set the environment variable: `export GEMINI_API_KEY="your-key"`

## Usage

### Basic Usage

```bash
# Simple summary
node src/index.js https://news.example.com/article

# Custom length and format
node src/index.js https://blog.example.com --length long --format bullets

# Include page metadata
node src/index.js https://docs.example.com --metadata

# Save to file
node src/index.js https://example.com --save my-summary
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
node src/index.js --batch urls.txt

# With comparative analysis
node src/index.js --batch urls.txt --comparative

# Save results
node src/index.js --batch urls.txt --comparative --save batch-report
```

### Advanced Features

```bash
# Follow internal links (up to 5)
node src/index.js https://example.com --follow 5

# Use content analysis plugins
node src/index.js https://example.com --plugins sentiment-analyzer,keyword-extractor

# Custom retry settings
node src/index.js https://example.com --max-retries 5 --retry-delay 3000
```

## JSON Output Format

Scrape AI provides comprehensive JSON output for easy integration with other applications, APIs, and development workflows.

### Benefits
- **CI/CD Integration**: Structured data perfect for automated pipelines
- **Analytics & Reporting**: Consistent schema for data analysis
- **API-like Responses**: Standardized format with status codes and error handling
- **Processing Metrics**: Detailed timing and performance data

### Usage
```bash
# Single URL with JSON output
node src/index.js https://example.com --format json

# Batch processing with plugins (auto-detects JSON format)
node src/index.js --batch urls.txt --plugins sentiment-analyzer,keyword-extractor

# Save JSON results to file
node src/index.js https://example.com --format json --save results.json
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

## Available Plugins

- **sentiment-analyzer**: Analyzes emotional tone of content
- **keyword-extractor**: Extracts key terms and phrases
- **readability-scorer**: Calculates reading difficulty scores

## Output Examples

### Standard Summary
```
--- Website Summary ---

Title: Example Article
URL: https://example.com/article
Date: 1/7/2026, 10:30:00 PM

This article discusses the latest developments in web scraping technology...

-----------------------
```

### JSON Format
```json
{
  "url": "https://example.com",
  "timestamp": "2026-01-07T23:21:20.159Z",
  "metadata": {
    "title": "Page Title",
    "description": "Meta description",
    "contentLength": 1234,
    "processingTime": 2.5
  },
  "summary": {
    "content": "AI-generated summary",
    "length": "medium",
    "keyPoints": ["point1", "point2"]
  },
  "plugins": {
    "sentiment-analyzer": {"sentiment": "positive", "score": 0.7},
    "keyword-extractor": {"keywords": [{"word": "tech", "count": 5}]}
  },
  "status": "success"
}
```

### Batch Results with Analysis
```json
{
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-01-07T23:21:20.159Z",
  "summary": {
    "total": 3,
    "successful": 3,
    "failed": 0
  },
  "results": [
    {
      "url": "https://example.com/page1",
      "timestamp": "2026-01-07T23:21:20.159Z",
      "metadata": {
        "title": "First Article",
        "description": "Article description",
        "contentLength": 2500,
        "processingTime": 3.2
      },
      "summary": {
        "content": "Summary content here...",
        "length": "medium",
        "keyPoints": ["key point 1", "key point 2"]
      },
      "plugins": {
        "sentiment-analyzer": {"sentiment": "positive", "score": 0.7},
        "keyword-extractor": {"keywords": [{"word": "technology", "count": 15}]}
      },
      "status": "success"
    }
  ],
  "comparative": {
    "commonThemes": ["technology", "innovation", "development"],
    "analysis": "All three articles share common themes around technology adoption..."
  }
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
