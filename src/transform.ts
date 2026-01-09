import { generateText, streamText } from 'ai';
import type { LanguageModelV1 } from 'ai';
import type { RawContent, OutputFormat, ScrapedData, AIMode } from './types';

const FORMAT_PROMPTS: Record<OutputFormat, string> = {
  markdown: 'Convert to clean markdown. Preserve structure with headers, lists, and links.',
  json: 'Extract structured data as JSON with keys: title, sections, keyPoints, links.',
  text: 'Extract clean plain text. Remove navigation, ads, and boilerplate.',
  html: 'Return the content as-is.',
};

export async function transform(
  raw: RawContent,
  format: OutputFormat,
  model?: LanguageModelV1,
  mode: AIMode = 'generate',
  schema?: Record<string, unknown>
): Promise<Omit<ScrapedData, 'url'>> {
  if (!model || format === 'html') {
    return { content: format === 'html' ? raw.html : raw.text, format, metadata: raw.metadata };
  }

  const prompt = `${FORMAT_PROMPTS[format]}${schema ? `\n\nSchema: ${JSON.stringify(schema)}` : ''}\n\nContent:\n${raw.text}`;

  if (mode === 'stream') {
    const { textStream } = streamText({ model, prompt });
    const chunks: string[] = [];
    for await (const chunk of textStream) chunks.push(chunk);
    return { content: chunks.join(''), format, metadata: raw.metadata };
  }

  const { text } = await generateText({ model, prompt });
  const structured = format === 'json' ? (() => { try { return JSON.parse(text); } catch { return { raw: text }; } })() : undefined;

  return { content: text, format, metadata: raw.metadata, structured };
}
