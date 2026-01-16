import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ScrapeOptions, ScrapeResult } from "./types";
import { EngineError } from "./errors";

const API_URL = process.env.SCRAPE_API_URL || "http://localhost:3000";

export class Scraper {
  private defaultModel: string;

  constructor(config: { model?: string } = {}) {
    this.defaultModel = config.model ?? "gpt-4";
  }

  async scrape<T extends z.ZodType>(
    url: string,
    options: ScrapeOptions<T>,
  ): Promise<ScrapeResult<z.infer<T>>> {
    const res = await fetch(`${API_URL}/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        prompt: options.prompt,
        model: options.model ?? this.defaultModel,
        schema: zodToJsonSchema(options.schema),
        output: options.output ?? "json",
        waitFor: options.waitFor,
        timeout: options.timeout,
      }),
    });

    const json = await res.json();
    if (!res.ok) throw new EngineError(json.error || `API error: ${res.status}`);

    let data = options.schema.parse(json.data) as z.infer<T>;
    if (options.postProcess) data = await options.postProcess(data);

    return { url, data, format: options.output ?? "json" };
  }
}
