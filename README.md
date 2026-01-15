<p align="center">
	<h1 align="center"><b>Crawl Inference</b></h1>
<p align="center">
Ultimate Web scraping SDK for age of AI, MIT licensed</p>
<br/>
</p>

## Quick Start

### 1. Install

```bash
npm install crawl-inference playwright
npm install @ai-sdk/openai  # or @ai-sdk/google, @ai-sdk/anthropic
```

### 2. Start the API Server

```bash
npm run serve
# or
npx tsx node_modules/crawl-inference/dist/api.js
```

### 3. Use the SDK

```typescript
import { Scraper } from "scrape-kit";
import { openai } from "@ai-sdk/openai";

const scraper = new Scraper({
  model: openai("gpt-4"),
});

const result = await scraper.scrape("https://example.com", {
  output: "markdown",
  selectors: ["article", ".content"],
});

console.log(result.content);
```

---

## API Reference

### Classes

- `Scraper` - Main scraper class
  - `scrape(url, options)` - Scrape single URL
  - `scrapeBatch(urls, options)` - Scrape multiple URLs

- `Transformer` - AI transformation class
  - `transform(raw, format, options)` - Transform raw content

### API Server

- `startServer(port?)` - Start the Express server (default port: 3000)
- `app` - Express app instance for custom middleware

#### POST /scrape

Request body:

```json
{
  "url": "https://example.com",
  "selectors": [".content"],
  "waitFor": "#loaded",
  "timeout": 30000
}
```

Response:

```json
{
  "success": true,
  "data": {
    "html": "<html>...</html>",
    "text": "Page content...",
    "metadata": {
      "title": "Page Title",
      "description": "Page description",
      "timestamp": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### Configuration Types

```typescript
interface ScraperConfig {
  model?: LanguageModelV1;
  output?: "markdown" | "json" | "text" | "html";
  retry?: RetryConfig;
}

interface ScrapeOptions {
  output?: "markdown" | "json" | "text" | "html";
  model?: LanguageModelV1;
  aiMode?: "stream" | "generate";
  schema?: Record<string, unknown>;
  selectors?: string[];
  waitFor?: string;
  timeout?: number;
  postProcess?: (data: ScrapedData) => ScrapedData | Promise<ScrapedData>;
}

interface RetryConfig {
  attempts?: number;
  delay?: number;
  backoff?: "linear" | "exponential";
}

interface TransformOptions {
  mode?: "stream" | "generate";
  schema?: Record<string, unknown>;
}
```

### Environment Variables

| Variable         | Description            | Default                 |
| ---------------- | ---------------------- | ----------------------- |
| `SCRAPE_API_URL` | API server URL for SDK | `http://localhost:3000` |
| `PORT`           | API server port        | `3000`                  |

### Error Types

- `ScrapeError` - Base error class
- `EngineError` - API/scraping failures
- `TransformError` - AI transformation failures
- `ConfigError` - Configuration errors

### Output Formats

- **html**: Raw HTML content
- **text**: Clean plain text
- **markdown**: Structured markdown (requires AI model)
- **json**: Structured JSON data (requires AI model)

### Advanced Options

- **Retry Configuration**: Automatic retry with exponential/linear backoff
- **AI Modes**: Stream or generate mode for AI transformations
- **Schema Validation**: Custom JSON schema for structured output
- **Post Processing**: Custom transformation pipeline
- **Selectors**: CSS selectors to extract specific content
- **Wait Conditions**: Wait for elements before scraping
