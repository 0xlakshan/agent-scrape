<p align="center">
	<h1 align="center"><b>Crawl Inference</b></h1>
<p align="center">
Ultimate Web scraping Infrastructure for age of AI, MIT licensed</p>
</p>

> ⚠️ This repo is still in early development, so you may run into bugs.  
> If you find any issues, feel free to open an issue or submit a PR contributions are very welcome. Thanks 💜


## Quick Start

```bash
git clone https://github.com/0xlakshan/crawl-inference.git
cd ./crawl-inference
npm install
```

## Usage

### SDK Client

```typescript
import { Scraper } from "scrape-kit";
import { z } from "zod";

const ProductSchema = z.object({
  name: z.string().describe("Product title text"),
  price: z.number().describe("Numeric price without currency"),
  image: z.string().url().describe("Main product image URL"),
});

const scraper = new Scraper();

// Estimate token usage before scraping
const usage = await scraper.getTokenUsage("https://example.com/products", {
  prompt: "return me top five products",
  schema: ProductSchema,
  model: "gemini-2.0-flash-exp",
  waitFor: 2000,
  timeout: 30000,
});

console.log(usage.tokens); // { prompt, schema, total }
console.log(usage.estimatedCost); // Cost breakdown

// Scrape with structured output
const result = await scraper.scrape("https://example.com/products", {
  prompt: "return me top five products",
  schema: ProductSchema,
  model: "gemini-2.0-flash-exp",
  output: "json",
  waitFor: 2000,
  timeout: 30000,
  postProcess: (data) => data,
});

console.log(result.data);
```

## API

### `new Scraper()`

Creates a new scraper instance. The SDK connects to the API server (default: `http://localhost:3000`, configurable via `SCRAPE_API_URL` env var).

### `scraper.scrape(url, options)`

Scrapes a URL and returns structured data.

**Options:**
- **prompt** - Tell the AI what you want to extract from the page. Be specific! For example: "Get all product names and prices" or "Extract the article title, author, and publish date". The
clearer your prompt, the better the results.

- **schema** - Define the shape of your data using Zod. This is like a blueprint that tells the scraper exactly what fields to extract and what type each field should be (string, number,
URL, etc.). The AI will validate the scraped data against this schema to ensure you get clean, structured output.

- **model** - Which Google Gemini model to use for extraction. Different models have different capabilities and costs. For example, "gemini-2.0-flash-exp" is fast and cost-effective for most
scraping tasks.

- **output** - How you want the data formatted. Currently only supports "json" (which is the default), so you can usually skip this option.

- **waitFor** - How long to wait (in milliseconds) after the page loads before scraping. Useful for pages with dynamic content that loads via JavaScript. For example, set to 2000 to wait 2
seconds for animations or lazy-loaded content to appear.

- **timeout** - Maximum time (in milliseconds) to wait for the page to load before giving up. Defaults to 30 seconds (30000ms). Increase this if you're scraping slow-loading pages.

- **postProcess** - A callback function to transform or clean up the scraped data before it's returned. Takes the raw extracted data as input and returns your modified version. Handy for
things like formatting dates, converting currencies, or filtering out unwanted items.

**Returns:** `Promise<ScrapeResult<T>>`

```typescript
{
  url: string;
  data: T; // Parsed and validated against schema
  format: "json";
}
```

### `scraper.getTokenUsage(url, options)`

Estimates token usage and cost before scraping.

| Option    | Type        | Required | Description                        |
| --------- | ----------- | -------- | ---------------------------------- |
| `prompt`  | `string`    | Yes      | AI extraction prompt               |
| `schema`  | `z.ZodType` | Yes      | Zod schema for output              |
| `model`   | `string`    | No       | Model (default: gemini-2.0-flash-exp) |
| `waitFor` | `number`    | No       | Wait time in ms after page load    |
| `timeout` | `number`    | No       | Page load timeout (default: 30000) |

**Returns:** `Promise<TokenUsageResult>`

```typescript
{
  url: string;
  tokens: {
    prompt: number;
    schema: number;
    total: number;
  };
  estimatedCost?: {
    inputCostPer1M: number;
    outputCostPer1M: number;
    estimatedInput: string;
    estimatedOutput: string;
  };
}
```

## Server

Start the API server:

```bash
npm run serve
# or
GOOGLE_API_KEY=xxx npx tsx packages/api/src/index.ts
```

The server runs on port 3000 by default (configurable via `PORT` env var).

### Endpoints

#### `POST /scrape`

Scrapes a URL and returns structured data.

**Request:**
```json
{
  "url": "https://example.com",
  "prompt": "extract products",
  "model": "gemini-2.0-flash-exp",
  "schema": {
    "type": "object",
    "properties": { "name": { "type": "string" } }
  },
  "output": "json",
  "waitFor": 2000,
  "timeout": 30000
}
```

**Response:**
```json
{
  "success": true,
  "data": { "name": "Product Name" }
}
```

#### `POST /token-usage`

Estimates token usage and cost.

**Request:**
```json
{
  "url": "https://example.com",
  "prompt": "extract products",
  "model": "gemini-2.0-flash-exp",
  "schema": {
    "type": "object",
    "properties": { "name": { "type": "string" } }
  },
  "waitFor": 2000,
  "timeout": 30000
}
```

**Response:**
```json
{
  "success": true,
  "tokens": {
    "prompt": 150,
    "schema": 50,
    "total": 200
  },
  "estimatedCost": {
    "inputCostPer1M": 0.075,
    "outputCostPer1M": 0.30,
    "estimatedInput": "$0.000015",
    "estimatedOutput": "$0.000060"
  }
}
```

#### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok"
}
```

## Environment Variables

- `GOOGLE_API_KEY` - Required for API server
- `SCRAPE_API_URL` - SDK client API endpoint (default: `http://localhost:3000`)
- `PORT` - API server port (default: `3000`)

## Development

```bash
# Build SDK
npm run build

# Watch mode
npm run dev

# Run tests
npm test

# Test coverage
npm run test:coverage

# Lint
npm run lint
```
