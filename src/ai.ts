import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { SummaryOptions, BatchResult, SummarizerError } from './types';
import { RateLimiter, retryWithBackoff } from './utils';

const MODEL = google('gemini-2.5-flash');
const rateLimiter = new RateLimiter(2, 1000);

const summaryStrategies = {
  paragraphs: (length: string) => `Provide a concise ${length} summary in paragraph form.`,
  bullets: () => 'Summarize as 5–7 concise bullet points covering the key ideas.',
  json: () => 'Return a JSON object with keys: "mainTopic", "keyPoints", "conclusion".',
};

function buildPrompt(content: string, options: SummaryOptions): string {
  const lengthMap = {
    short: 'one paragraph',
    medium: 'two paragraphs',
    long: 'three to four paragraphs',
  };

  const length = lengthMap[options.length || 'medium'];
  const strategy = summaryStrategies[options.format || 'paragraphs'](length);

  return `
${strategy}
Focus on the core ideas and conclusions.

Content:
${content}
  `.trim();
}

function buildComparativePrompt(results: BatchResult[]): string {
  const contents = results.map((r, i) =>
    `Source ${i + 1} (${r.metadata.title || r.url}):\n${r.summary}`
  ).join('\n\n---\n\n');

  return `
Compare and contrast the following summaries from different web pages. Identify:
1. Common themes and overlapping topics
2. Unique perspectives or information in each source
3. Contradictions or differing viewpoints
4. Overall synthesis of the information

Sources:
${contents}

Provide a comparative analysis in clear paragraphs.
  `.trim();
}

export async function summarizeContent(
  content: string,
  options: SummaryOptions
): Promise<string> {
  return rateLimiter.execute(async () => {
    return retryWithBackoff(
      async () => {
        const { text } = await generateText({
          model: MODEL,
          prompt: buildPrompt(content, options),
        });

        if (!text || text.trim().length === 0) {
          throw new SummarizerError(
            'AI model returned empty response',
            'EMPTY_SUMMARY',
            true
          );
        }

        return text;
      },
      {
        maxRetries: options.maxRetries || 3,
        baseDelay: options.retryDelay || 1000,
        operation: 'Summarization'
      }
    );
  });
}

export async function generateComparativeSummary(
  results: BatchResult[],
  options: SummaryOptions
): Promise<string> {
  return rateLimiter.execute(async () => {
    return retryWithBackoff(
      async () => {
        const { text } = await generateText({
          model: MODEL,
          prompt: buildComparativePrompt(results),
        });

        if (!text || text.trim().length === 0) {
          throw new SummarizerError(
            'AI model returned empty comparative summary',
            'EMPTY_SUMMARY',
            true
          );
        }

        return text;
      },
      {
        maxRetries: options.maxRetries || 3,
        baseDelay: options.retryDelay || 1000,
        operation: 'Comparative summary'
      }
    );
  });
}
