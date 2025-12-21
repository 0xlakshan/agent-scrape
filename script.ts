import puppeteer, { Browser, Page } from 'puppeteer';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import * as fs from 'fs/promises';
import * as path from 'path';

type BrowserContext = {
  browser: Browser;
  page: Page;
};

type SummaryOptions = {
  length?: 'short' | 'medium' | 'long';
  format?: 'paragraphs' | 'bullets' | 'json';
  includeMetadata?: boolean;
  saveToFile?: string;
};

type PageMetadata = {
  title: string;
  description: string;
  url: string;
  timestamp: string;
};

type PageContent = {
  text: string;
  metadata: PageMetadata;
};

class SummarizerError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'SummarizerError';
  }
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
const MODEL = google('gemini-2.5-flash');

function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function createBrowserContext(): Promise<BrowserContext> {
  try {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    return { browser, page };
  } catch (error) {
    throw new SummarizerError(
      `Failed to launch browser: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'BROWSER_LAUNCH_FAILED'
    );
  }
}

async function withBrowser<T>(
  fn: (ctx: BrowserContext) => Promise<T>
): Promise<T> {
  let ctx: BrowserContext | null = null;
  try {
    ctx = await createBrowserContext();
    return await fn(ctx);
  } catch (error) {
    if (error instanceof SummarizerError) throw error;
    throw new SummarizerError(
      `Browser operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'BROWSER_OPERATION_FAILED'
    );
  } finally {
    if (ctx?.browser) {
      try {
        await ctx.browser.close();
      } catch (error) {
        console.warn('Failed to close browser:', error);
      }
    }
  }
}

async function navigate(page: Page, url: string): Promise<void> {
  try {
    const response = await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });

    if (!response) {
      throw new SummarizerError('No response received from URL', 'NO_RESPONSE');
    }

    const status = response.status();
    if (status >= 400) {
      throw new SummarizerError(
        `HTTP error ${status}: ${response.statusText()}`,
        'HTTP_ERROR'
      );
    }
  } catch (error) {
    if (error instanceof SummarizerError) throw error;
    
    if (error instanceof Error) {
      if (error.name === 'TimeoutError') {
        throw new SummarizerError(
          'Page load timeout - the website took too long to respond',
          'TIMEOUT'
        );
      }
      throw new SummarizerError(
        `Failed to navigate to URL: ${error.message}`,
        'NAVIGATION_FAILED'
      );
    }
    throw error;
  }
}

async function extractMetadata(page: Page): Promise<PageMetadata> {
  try {
    const metadata = await page.evaluate(() => {
      const getMeta = (name: string) =>
        document
          .querySelector(`meta[name="${name}"], meta[property="og:${name}"]`)
          ?.getAttribute('content') || '';
      return {
        title: document.title || getMeta('title'),
        description: getMeta('description'),
        url: window.location.href,
      };
    });

    return {
      ...metadata,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    throw new SummarizerError(
      `Failed to extract metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'METADATA_EXTRACTION_FAILED'
    );
  }
}

function removeDuplicateLines(text: string): string {
  const seen = new Set<string>();
  return text
    .split('\n')
    .filter((line) => {
      const normalized = line.trim().toLowerCase();
      if (normalized.length < 30) return true;
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .join('\n');
}

async function extractAndCleanText(page: Page): Promise<string> {
  try {
    const text = await page.evaluate(() => {
      const NOISE = [
        'nav',
        'footer',
        'aside',
        'script',
        'style',
        'noscript',
        'iframe',
        'header',
        '[role="navigation"]',
        '.cookie',
        '.consent',
        '.ads',
        '.popup',
        '.modal',
      ];

      NOISE.forEach((s) =>
        document.querySelectorAll(s).forEach((el) => el.remove())
      );

      const CANDIDATES = [
        'article',
        'main',
        '[role="main"]',
        '.content',
        '.post',
      ];

      let best = '';
      for (const selector of CANDIDATES) {
        const el = document.querySelector(selector);
        if (!el) continue;
        const text = el.innerText.trim();
        if (text.length > best.length) best = text;
      }

      return best || document.body?.innerText || '';
    });

    const cleaned = removeDuplicateLines(
      text
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim()
    );

    if (!cleaned || cleaned.length < 50) {
      throw new SummarizerError(
        'No meaningful content found on the page',
        'NO_CONTENT'
      );
    }

    return cleaned;
  } catch (error) {
    if (error instanceof SummarizerError) throw error;
    throw new SummarizerError(
      `Failed to extract text content: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'TEXT_EXTRACTION_FAILED'
    );
  }
}

const summaryStrategies = {
  paragraphs: (length: string) =>
    `Provide a concise ${length} summary in paragraph form.`,
  bullets: () =>
    'Summarize as 5–7 concise bullet points covering the key ideas.',
  json: () =>
    'Return a JSON object with keys: "mainTopic", "keyPoints", "conclusion".',
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

async function summarizeContent(
  content: string,
  options: SummaryOptions
): Promise<string> {
  try {
    const { text } = await generateText({
      model: MODEL,
      prompt: buildPrompt(content, options),
    });

    if (!text || text.trim().length === 0) {
      throw new SummarizerError(
        'AI model returned empty response',
        'EMPTY_SUMMARY'
      );
    }

    return text;
  } catch (error) {
    if (error instanceof SummarizerError) throw error;
    throw new SummarizerError(
      `Failed to generate summary: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'SUMMARIZATION_FAILED'
    );
  }
}

function formatOutput(
  summary: string,
  data: PageContent,
  options: SummaryOptions
): string {
  let output = '\n--- Website Summary ---\n\n';

  if (options.includeMetadata) {
    output += `Title: ${data.metadata.title}\n`;
    output += `URL: ${data.metadata.url}\n`;
    output += `Date: ${new Date(data.metadata.timestamp).toLocaleString()}\n`;
    if (data.metadata.description) {
      output += `Description: ${data.metadata.description}\n`;
    }
    output += '\n';
  }

  output += summary;
  output += '\n\n-----------------------\n';

  return output;
}

async function saveToFileIfNeeded(
  output: string,
  options: SummaryOptions
): Promise<void> {
  if (!options.saveToFile) return;

  try {
    const dir = path.join(process.cwd(), 'summaries');
    await fs.mkdir(dir, { recursive: true });

    const filename = options.saveToFile.endsWith('.txt')
      ? options.saveToFile
      : `${options.saveToFile}.txt`;

    await fs.writeFile(path.join(dir, filename), output, 'utf-8');
    console.log(`\n✓ Summary saved to: summaries/${filename}`);
  } catch (error) {
    throw new SummarizerError(
      `Failed to save file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'FILE_SAVE_FAILED'
    );
  }
}

async function summarizeWebsite(url: string, options: SummaryOptions = {}) {
  if (!isValidUrl(url)) {
    throw new SummarizerError(
      'Invalid URL format. Please provide a valid http:// or https:// URL',
      'INVALID_URL'
    );
  }

  await withBrowser(async ({ page }) => {
    await navigate(page, url);

    const [text, metadata] = await Promise.all([
      extractAndCleanText(page),
      extractMetadata(page),
    ]);

    const summary = await summarizeContent(text, options);
    const output = formatOutput(summary, { text, metadata }, options);

    console.log(output);
    await saveToFileIfNeeded(output, options);
  });
}

function parseArgs(): { url: string; options: SummaryOptions } {
  const args = process.argv.slice(2);

  if (!args.length || args.includes('--help')) {
    console.log(`
Usage: node summarizer.js <url> [options]

Options:
  --length <short|medium|long>    Summary length (default: medium)
  --format <paragraphs|bullets|json>  Output format (default: paragraphs)
  --metadata                       Include page metadata
  --save <filename>                Save summary to file
  --help                           Show this help message

Example:
  node summarizer.js https://example.com --length short --metadata --save summary
    `);
    process.exit(0);
  }

  const url = args[0];
  const options: SummaryOptions = {};

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--length':
        if (i + 1 >= args.length) {
          throw new SummarizerError(
            '--length requires a value (short, medium, or long)',
            'INVALID_ARGS'
          );
        }
        const length = args[++i];
        if (!['short', 'medium', 'long'].includes(length)) {
          throw new SummarizerError(
            `Invalid length: ${length}. Must be short, medium, or long`,
            'INVALID_ARGS'
          );
        }
        options.length = length as SummaryOptions['length'];
        break;

      case '--format':
        if (i + 1 >= args.length) {
          throw new SummarizerError(
            '--format requires a value (paragraphs, bullets, or json)',
            'INVALID_ARGS'
          );
        }
        const format = args[++i];
        if (!['paragraphs', 'bullets', 'json'].includes(format)) {
          throw new SummarizerError(
            `Invalid format: ${format}. Must be paragraphs, bullets, or json`,
            'INVALID_ARGS'
          );
        }
        options.format = format as SummaryOptions['format'];
        break;

      case '--metadata':
        options.includeMetadata = true;
        break;

      case '--save':
        if (i + 1 >= args.length) {
          throw new SummarizerError(
            '--save requires a filename',
            'INVALID_ARGS'
          );
        }
        options.saveToFile = args[++i];
        break;

      default:
        throw new SummarizerError(
          `Unknown option: ${args[i]}. Use --help for usage information`,
          'INVALID_ARGS'
        );
    }
  }

  return { url, options };
}

(async () => {
  try {
    const { url, options } = parseArgs();
    await summarizeWebsite(url, options);
  } catch (error) {
    if (error instanceof SummarizerError) {
      console.error(`\n Error [${error.code}]: ${error.message}\n`);
      process.exit(1);
    }
    
    console.error('\n Unexpected error:', error);
    process.exit(1);
  }
})();
