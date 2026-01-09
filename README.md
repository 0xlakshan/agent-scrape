<p align="center">
	<h1 align="center"><b>Scrape AI</b></h1>
<p align="center">
Ultimate web scraping SDK, novendor lock-in
</p>
<br/>
</p>

### Quick Start

```bash
npm install scrape-kit puppeteer
npm install @ai-sdk/openai or @ai-sdk/google, @ai-sdk/anthropic
```

```typescript
import { Scraper } from 'scrape-kit';
import { openai } from '@ai-sdk/openai';

const scraper = new Scraper({
  engine: 'puppeteer',
  model: openai('gpt-4')
});

const result = await scraper.scrape('https://example.com', {
  output: 'markdown',
  selectors: ['article', '.content']
});

console.log(result.content);
await scraper.dispose();
```
---

## API Reference

#### Classes

- `Scraper` - Main scraper class
  - `scrape(url, options)` - Scrape single URL
  - `scrapeBatch(urls, options)` - Scrape multiple URLs
  - `dispose()` - Clean up resources

- `Transformer` - AI transformation class
  - `transform(raw, format, options)` - Transform raw content

#### Configuration Types

```typescript
interface ScraperConfig {
  engine?: 'puppeteer' | 'firecrawl';
  model?: LanguageModelV1;
  output?: 'markdown' | 'json' | 'text' | 'html';
  firecrawl?: { apiKey: string };
  retry?: RetryConfig;
}

interface ScrapeOptions {
  output?: 'markdown' | 'json' | 'text' | 'html';
  model?: LanguageModelV1;
  aiMode?: 'stream' | 'generate';
  schema?: Record<string, unknown>;
  selectors?: string[];
  postProcess?: (data: ScrapedData) => ScrapedData | Promise<ScrapedData>;
}

interface RetryConfig {
  attempts?: number;
  delay?: number;
  backoff?: 'linear' | 'exponential';
}

interface EngineOptions {
  selectors?: string[];
  waitFor?: string;
  timeout?: number;
}

interface TransformOptions {
  mode?: 'stream' | 'generate';
  schema?: Record<string, unknown>;
}
```

#### Engines

- `PuppeteerEngine` - Puppeteer based engine
  - Supports custom selectors, wait conditions, and timeout
- `FirecrawlEngine` - Firecrawl based engine
  - Requires API key configuration

#### Error Types

- `ScrapeError` - Base error class
- `EngineError` - Scraping engine failures
- `TransformError` - AI transformation failures
- `ConfigError` - Configuration errors

#### Output Formats

- **html**: Raw HTML content
- **text**: Clean plain text
- **markdown**: Structured markdown
- **json**: Structured JSON data

#### Advanced Options

- **Retry Configuration**: Automatic retry with exponential/linear backoff
- **AI Modes**: Stream or generate mode for AI transformations
- **Schema Validation**: Custom JSON schema for structured output
- **Post Processing**: Custom transformation pipeline
- **Engine Options**: Timeout, selectors, and wait conditions
