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
  batch?: boolean;
  comparative?: boolean;
  followLinks?: number;
  maxRetries?: number;
  retryDelay?: number;
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
  links?: string[];
};

type BatchResult = {
  url: string;
  summary: string;
  metadata: PageMetadata;
  error?: string;
  retries?: number;
};

class SummarizerError extends Error {
  constructor(message: string, public readonly code: string, public readonly retryable: boolean = false) {
    super(message);
    this.name = 'SummarizerError';
  }
}

class RateLimiter {
  private queue: Array<() => Promise<void>> = [];
  private running = 0;
  private lastRequestTime = 0;

  constructor(
    private maxConcurrent: number = 1,
    private minDelay: number = 1000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const now = Date.now();
          const timeSinceLastRequest = now - this.lastRequestTime;
          if (timeSinceLastRequest < this.minDelay) {
            await new Promise(r => setTimeout(r, this.minDelay - timeSinceLastRequest));
          }
          
          this.lastRequestTime = Date.now();
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.running--;
          this.processQueue();
        }
      });

      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.running++;
    const task = this.queue.shift();
    if (task) {
      task();
    }
  }
}

const rateLimiter = new RateLimiter(2, 1000);

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
const MODEL = google('gemini-2.5-flash');

function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelay: number; operation: string }
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (error instanceof SummarizerError && !error.retryable) {
        throw error;
      }

      if (attempt < options.maxRetries) {
        const delay = options.baseDelay * Math.pow(2, attempt);
        console.log(`⚠️  ${options.operation} failed (attempt ${attempt + 1}/${options.maxRetries + 1}). Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw new SummarizerError(
    `${options.operation} failed after ${options.maxRetries + 1} attempts: ${lastError?.message}`,
    'MAX_RETRIES_EXCEEDED',
    false
  );
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
      'BROWSER_LAUNCH_FAILED',
      false
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
      'BROWSER_OPERATION_FAILED',
      false
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
      throw new SummarizerError('No response received from URL', 'NO_RESPONSE', true);
    }

    const status = response.status();
    if (status === 429) {
      throw new SummarizerError(
        'Rate limited by server',
        'RATE_LIMITED',
        true
      );
    }
    if (status >= 500) {
      throw new SummarizerError(
        `Server error ${status}: ${response.statusText()}`,
        'SERVER_ERROR',
        true
      );
    }
    if (status >= 400) {
      throw new SummarizerError(
        `HTTP error ${status}: ${response.statusText()}`,
        'HTTP_ERROR',
        false
      );
    }
  } catch (error) {
    if (error instanceof SummarizerError) throw error;
    if (error instanceof Error) {
      if (error.name === 'TimeoutError') {
        throw new SummarizerError(
          'Page load timeout - the website took too long to respond',
          'TIMEOUT',
          true
        );
      }
      throw new SummarizerError(
        `Failed to navigate to URL: ${error.message}`,
        'NAVIGATION_FAILED',
        true
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
      'METADATA_EXTRACTION_FAILED',
      true
    );
  }
}

async function extractLinks(page: Page, baseUrl: string): Promise<string[]> {
  try {
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href]'))
        .map(a => (a as HTMLAnchorElement).href)
        .filter(href => href && !href.startsWith('#'));
    });

    const base = new URL(baseUrl);
    return [...new Set(links)]
      .filter(link => {
        try {
          const url = new URL(link);
          return url.hostname === base.hostname;
        } catch {
          return false;
        }
      })
      .slice(0, 20);
  } catch (error) {
    console.warn('Failed to extract links:', error);
    return [];
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
        'nav', 'footer', 'aside', 'script', 'style', 'noscript', 'iframe',
        'header', '[role="navigation"]', '.cookie', '.consent', '.ads',
        '.popup', '.modal',
      ];

      NOISE.forEach((s) =>
        document.querySelectorAll(s).forEach((el) => el.remove())
      );

      const CANDIDATES = [
        'article', 'main', '[role="main"]', '.content', '.post',
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
        'NO_CONTENT',
        false
      );
    }

    return cleaned;
  } catch (error) {
    if (error instanceof SummarizerError) throw error;
    throw new SummarizerError(
      `Failed to extract text content: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'TEXT_EXTRACTION_FAILED',
      true
    );
  }
}

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

async function summarizeContent(
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

async function generateComparativeSummary(results: BatchResult[], options: SummaryOptions): Promise<string> {
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

function formatBatchOutput(results: BatchResult[], comparative?: string): string {
  let output = '\n=== BATCH SUMMARY RESULTS ===\n\n';
  output += `Total URLs processed: ${results.length}\n`;
  output += `Successful: ${results.filter(r => !r.error).length}\n`;
  output += `Failed: ${results.filter(r => r.error).length}\n\n`;

  results.forEach((result, index) => {
    output += `\n--- Summary ${index + 1} ---\n`;
    output += `URL: ${result.url}\n`;
    
    if (result.error) {
      output += `ERROR: ${result.error}\n`;
      if (result.retries) {
        output += `Attempts: ${result.retries + 1}\n`;
      }
    } else {
      output += `Title: ${result.metadata.title}\n`;
      output += `Date: ${new Date(result.metadata.timestamp).toLocaleString()}\n`;
      if (result.retries) {
        output += `Retries: ${result.retries}\n`;
      }
      output += `\n${result.summary}\n`;
    }
    output += '\n' + '-'.repeat(50) + '\n';
  });

  if (comparative) {
    output += '\n\n=== COMPARATIVE ANALYSIS ===\n\n';
    output += comparative;
    output += '\n\n' + '='.repeat(50) + '\n';
  }

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
      'FILE_SAVE_FAILED',
      false
    );
  }
}

async function processUrl(url: string, options: SummaryOptions, ctx: BrowserContext): Promise<BatchResult> {
  let retries = 0;
  
  return retryWithBackoff(
    async () => {
      try {
        await navigate(ctx.page, url);
        
        const [text, metadata] = await Promise.all([
          extractAndCleanText(ctx.page),
          extractMetadata(ctx.page),
        ]);

        const summary = await summarizeContent(text, options);

        return {
          url,
          summary,
          metadata,
          retries: retries > 0 ? retries : undefined,
        };
      } catch (error) {
        retries++;
        throw error;
      }
    },
    {
      maxRetries: options.maxRetries || 3,
      baseDelay: options.retryDelay || 2000,
      operation: `Processing ${url}`
    }
  ).catch(error => ({
    url,
    summary: '',
    metadata: { title: '', description: '', url, timestamp: new Date().toISOString() },
    error: error instanceof Error ? error.message : 'Unknown error',
    retries: retries > 0 ? retries : undefined,
  }));
}

async function summarizeWebsite(url: string, options: SummaryOptions = {}) {
  if (!isValidUrl(url)) {
    throw new SummarizerError(
      'Invalid URL format. Please provide a valid http:// or https:// URL',
      'INVALID_URL',
      false
    );
  }

  await withBrowser(async ({ browser, page }) => {
    await retryWithBackoff(
      async () => navigate(page, url),
      {
        maxRetries: options.maxRetries || 3,
        baseDelay: options.retryDelay || 2000,
        operation: `Navigating to ${url}`
      }
    );

    const [text, metadata] = await Promise.all([
      retryWithBackoff(
        async () => extractAndCleanText(page),
        {
          maxRetries: options.maxRetries || 3,
          baseDelay: options.retryDelay || 1000,
          operation: 'Extracting text'
        }
      ),
      retryWithBackoff(
        async () => extractMetadata(page),
        {
          maxRetries: options.maxRetries || 3,
          baseDelay: options.retryDelay || 1000,
          operation: 'Extracting metadata'
        }
      ),
    ]);

    const links = options.followLinks ? await extractLinks(page, url) : [];

    const summary = await summarizeContent(text, options);
    const output = formatOutput(summary, { text, metadata, links }, options);
    console.log(output);

    if (options.followLinks && links.length > 0) {
      console.log(`\n📎 Found ${links.length} related links. Processing ${Math.min(links.length, options.followLinks)}...\n`);
      
      const linkResults: BatchResult[] = [];
      const linksToProcess = links.slice(0, options.followLinks);

      for (let i = 0; i < linksToProcess.length; i++) {
        const link = linksToProcess[i];
        console.log(`Processing link ${i + 1}/${linksToProcess.length}: ${link}`);
        
        const result = await processUrl(link, { ...options, includeMetadata: true }, { browser, page });
        linkResults.push(result);
        
        await sleep(1000);
      }

      const batchOutput = formatBatchOutput(linkResults);
      console.log(batchOutput);

      if (options.saveToFile) {
        const linkFilename = options.saveToFile.replace(/\.txt$/, '') + '_links.txt';
        await saveToFileIfNeeded(batchOutput, { ...options, saveToFile: linkFilename });
      }
    }

    await saveToFileIfNeeded(output, options);
  });
}

async function summarizeBatch(urls: string[], options: SummaryOptions = {}) {
  const results: BatchResult[] = [];

  await withBrowser(async (ctx) => {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`\nProcessing ${i + 1}/${urls.length}: ${url}`);

      if (!isValidUrl(url)) {
        results.push({
          url,
          summary: '',
          metadata: { title: '', description: '', url, timestamp: new Date().toISOString() },
          error: 'Invalid URL format',
        });
        continue;
      }

      const result = await processUrl(url, options, ctx);
      results.push(result);

      await sleep(1000);
    }
  });

  let comparativeSummary: string | undefined;
  if (options.comparative && results.filter(r => !r.error).length >= 2) {
    console.log('\n🔄 Generating comparative analysis...\n');
    comparativeSummary = await generateComparativeSummary(results.filter(r => !r.error), options);
  }

  const output = formatBatchOutput(results, comparativeSummary);
  console.log(output);

  await saveToFileIfNeeded(output, options);
}

async function loadUrlsFromFile(filepath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  } catch (error) {
    throw new SummarizerError(
      `Failed to read URL file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'FILE_READ_FAILED',
      false
    );
  }
}

function parseArgs(): { urls: string[]; options: SummaryOptions } {
  const args = process.argv.slice(2);

  if (!args.length || args.includes('--help')) {
    console.log(`
Usage: node summarizer.js <url|file> [options]

Options:
  --length <type>        Summary length: short, medium, long (default: medium)
  --format <type>        Output format: paragraphs, bullets, json (default: paragraphs)
  --metadata             Include page metadata
  --save <filename>      Save summary to file
  --batch <file>         Process multiple URLs from a file
  --comparative          Generate comparative analysis (batch mode only)
  --follow <n>           Follow and summarize N internal links from the page
  --max-retries <n>      Maximum retry attempts for failed requests (default: 3)
  --retry-delay <ms>     Base delay between retries in milliseconds (default: 2000)
  --help                 Show this help message

Examples:
  node summarizer.js https://example.com --length short --metadata
  node summarizer.js --batch urls.txt --comparative --save report
  node summarizer.js https://example.com --follow 5 --max-retries 5
  node summarizer.js https://example.com --retry-delay 3000 --max-retries 2
    `);
    process.exit(0);
  }

  const options: SummaryOptions = {};
  let urls: string[] = [];
  let batchFile: string | null = null;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--length':
        if (i + 1 >= args.length) {
          throw new SummarizerError(
            '--length requires a value (short, medium, or long)',
            'INVALID_ARGS',
            false
          );
        }
        const length = args[++i];
        if (!['short', 'medium', 'long'].includes(length)) {
          throw new SummarizerError(
            `Invalid length: ${length}. Must be short, medium, or long`,
            'INVALID_ARGS',
            false
          );
        }
        options.length = length as SummaryOptions['length'];
        break;

      case '--format':
        if (i + 1 >= args.length) {
          throw new SummarizerError(
            '--format requires a value (paragraphs, bullets, or json)',
            'INVALID_ARGS',
            false
          );
        }
        const format = args[++i];
        if (!['paragraphs', 'bullets', 'json'].includes(format)) {
          throw new SummarizerError(
            `Invalid format: ${format}. Must be paragraphs, bullets, or json`,
            'INVALID_ARGS',
            false
          );
        }
        options.format = format as SummaryOptions['format'];
        break;

      case '--metadata':
        options.includeMetadata = true;
        break;

      case '--save':
        if (i + 1 >= args.length) {
          throw new SummarizerError('--save requires a filename', 'INVALID_ARGS', false);
        }
        options.saveToFile = args[++i];
        break;

      case '--batch':
        if (i + 1 >= args.length) {
          throw new SummarizerError('--batch requires a filename', 'INVALID_ARGS', false);
        }
        batchFile = args[++i];
        options.batch = true;
        break;

      case '--comparative':
        options.comparative = true;
        break;

      case '--follow':
        if (i + 1 >= args.length) {
          throw new SummarizerError('--follow requires a number', 'INVALID_ARGS', false);
        }
        const count = parseInt(args[++i], 10);
        if (isNaN(count) || count < 1 || count > 20) {
          throw new SummarizerError(
            'Follow count must be between 1 and 20',
            'INVALID_ARGS',
            false
          );
        }
        options.followLinks = count;
        break;

      case '--max-retries':
        if (i + 1 >= args.length) {
          throw new SummarizerError('--max-retries requires a number', 'INVALID_ARGS', false);
        }
        const retries = parseInt(args[++i], 10);
        if (isNaN(retries) || retries < 0 || retries > 10) {
          throw new SummarizerError(
            'Max retries must be between 0 and 10',
            'INVALID_ARGS',
            false
          );
        }
        options.maxRetries = retries;
        break;

      case '--retry-delay':
        if (i + 1 >= args.length) {
          throw new SummarizerError('--retry-delay requires a number', 'INVALID_ARGS', false);
        }
        const delay = parseInt(args[++i], 10);
        if (isNaN(delay) || delay < 100 || delay > 30000) {
          throw new SummarizerError(
            'Retry delay must be between 100 and 30000 milliseconds',
            'INVALID_ARGS',
            false
          );
        }
        options.retryDelay = delay;
        break;

      default:
        if (!args[i].startsWith('--')) {
          urls.push(args[i]);
        } else {
          throw new SummarizerError(
            `Unknown option: ${args[i]}. Use --help for usage information`,
            'INVALID_ARGS',
            false
          );
        }
    }
  }

  return { urls: batchFile ? [batchFile] : urls, options };
}

(async () => {
  try {
    const { urls, options } = parseArgs();

    if (options.batch && urls.length > 0) {
      const urlList = await loadUrlsFromFile(urls[0]);
      await summarizeBatch(urlList, options);
    } else if (urls.length === 1) {
      await summarizeWebsite(urls[0], options);
    } else if (urls.length > 1) {
      await summarizeBatch(urls, options);
    } else {
      throw new SummarizerError(
        'No URL provided. Use --help for usage information',
        'INVALID_ARGS',
        false
      );
    }
  } catch (error) {
    if (error instanceof SummarizerError) {
      console.error(`\n❌ Error [${error.code}]: ${error.message}\n`);
      process.exit(1);
    }
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  }
})();
