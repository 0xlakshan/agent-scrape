<p align="center">
	<h1 align="center"><b>Crawl Inference</b></h1>
<p align="center">
AI powered web scraping SDK with structured output</p>
</p>

## Quick Start

```bash
npm install scrape-kit playwright zod @ai-sdk/openai
```

## Usage

```typescript
import { Scraper } from "scrape-kit";
import { z } from "zod";

const ProductSchema = z.object({
  name: z.string().describe("Product title text"),
  price: z.number().describe("Numeric price without currency"),
  image: z.string().url().describe("Main product image URL"),
});

const scraper = new Scraper({ model: "gpt-4" });

const result = await scraper.scrape("https://example.com/products", {
  prompt: "return me top five products",
  schema: ProductSchema,
  output: "json", // or "xml"
  waitFor: 2000,
  timeout: 30000,
  postProcess: (data) => data,
});

console.log(result.data);
```

## API

### `new Scraper(config?)`

- `model`: Default model (default: "gpt-4")

### `scraper.scrape(url, options)`

| Option        | Type                | Required | Description                   |
| ------------- | ------------------- | -------- | ----------------------------- |
| `prompt`      | `string`            | Yes      | AI extraction prompt          |
| `schema`      | `z.ZodType`         | Yes      | Zod schema for output         |
| `output`      | `"json"` \| `"xml"` | No       | Output format (default: json) |
| `model`       | `string`            | No       | Override default model        |
| `waitFor`     | `number`            | No       | Wait time in ms after load    |
| `timeout`     | `number`            | No       | Page load timeout in ms       |
| `postProcess` | `(data) => data`    | No       | Transform result callback     |

## Server

```bash
npm run serve
# or
OPENAI_API_KEY=xxx npx tsx packages/api/index.ts
```

### POST /scrape

```json
{
  "url": "https://example.com",
  "prompt": "extract products",
  "schema": {
    "type": "object",
    "properties": { "name": { "type": "string" } }
  },
  "model": "gpt-4",
  "output": "json",
  "waitFor": 2000,
  "timeout": 30000
}
```
