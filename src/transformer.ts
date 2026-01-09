import { generateText, streamText } from 'ai';
import type { LanguageModelV1 } from 'ai';
import type { RawContent, OutputFormat, AIMode } from './types';
import { TransformError } from './errors';

const FORMAT_PROMPTS: Record<OutputFormat, string> = {
  markdown: 'Convert to clean markdown. Preserve structure with headers, lists, and links.',
  json: 'Extract structured data as JSON with keys: title, sections, keyPoints, links.',
  text: 'Extract clean plain text. Remove navigation, ads, and boilerplate.',
  html: 'Return the content as-is.',
};

export interface TransformOptions {
  mode?: AIMode;
  schema?: Record<string, unknown>;
}

export interface TransformedContent {
  content: string;
  format: OutputFormat;
  structured?: Record<string, unknown>;
}

export class Transformer {
  constructor(private model?: LanguageModelV1) {}

  async transform(raw: RawContent, format: OutputFormat, options: TransformOptions = {}): Promise<TransformedContent> {
    if (!this.model || format === 'html') {
      return { content: format === 'html' ? raw.html : raw.text, format };
    }

    const prompt = `${FORMAT_PROMPTS[format]}${options.schema ? `\n\nSchema: ${JSON.stringify(options.schema)}` : ''}\n\nContent:\n${raw.text}`;

    try {
      if (options.mode === 'stream') {
        const { textStream } = streamText({ model: this.model, prompt });
        const chunks: string[] = [];
        for await (const chunk of textStream) chunks.push(chunk);
        return { content: chunks.join(''), format };
      }

      const { text } = await generateText({ model: this.model, prompt });
      const structured = format === 'json' ? this.parseJson(text) : undefined;

      return { content: text, format, structured };
    } catch (err) {
      throw new TransformError(`AI transformation failed: ${(err as Error).message}`, err as Error);
    }
  }

  private parseJson(text: string): Record<string, unknown> {
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
}
