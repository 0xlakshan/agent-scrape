import { Engine } from '../engine';
import type { EngineOptions, RawContent } from '../types';
import { EngineError } from '../errors';

export class FirecrawlEngine extends Engine {
  constructor(private apiKey: string) {
    super();
  }

  async scrape(url: string, options: EngineOptions = {}): Promise<RawContent> {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ url, formats: ['markdown', 'html'], timeout: options.timeout ?? 30000 }),
    });

    if (!response.ok) {
      throw new EngineError(`Firecrawl error: ${response.status} ${response.statusText}`);
    }

    const { data } = await response.json();
    return {
      html: data.html || '',
      text: data.markdown || data.rawHtml || '',
      metadata: { title: data.metadata?.title || '', description: data.metadata?.description || '', timestamp: new Date().toISOString() },
    };
  }

  async dispose(): Promise<void> {}
}
