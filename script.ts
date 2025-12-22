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
};

class SummarizerError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'SummarizerError';
  }
}

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

async function generateComparativeSummary(results: BatchResult[]): Promise<string> {
  try {
    const { text } = await generateText({
      model: MODEL,
      prompt: buildComparativePrompt(results),
    });

    if (!text || text.trim().length === 0) {
      throw new SummarizerError(
        'AI model returned empty comparative summary',
        'EMPTY_SUMMARY'
      );
    }

    return text;
  } catch (error) {
    throw new SummarizerError(
      `Failed to generate comparative summary: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'COMPARATIVE_SUMMARY_FAILED'
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
    } else {
      output += `Title: ${result.metadata.title}\n`;
      output += `Date: ${new Date(result.metadata.timestamp).toLocaleString()}\n\n`;
      output += result.summary;
      output += '\n';
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
      'FILE_SAVE_FAILED'
    );
  }
}

async function processUrl(url: string, options: SummaryOptions, ctx: BrowserContext): Promise<BatchResult> {
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
    };
  } catch (error) {
    return {
      url,
      summary: '',
      metadata: { title: '', description: '', url, timestamp: new Date().toISOString() },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function summarizeWebsite(url: string, options: SummaryOptions = {}) {
  if (!isValidUrl(url)) {
    throw new SummarizerError(
      'Invalid URL format. Please provide a valid http:// or https:// URL',
      'INVALID_URL'
    );
  }

  await withBrowser(async ({ browser, page }) => {
    await navigate(page, url);

    const [text, metadata] = await Promise.all([
      extractAndCleanText(page),
      extractMetadata(page),
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
        
        await new Promise(resolve => setTimeout(resolve, 1000));
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

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  });

  let comparativeSummary: string | undefined;
  if (options.comparative && results.filter(r => !r.error).length >= 2) {
    console.log('\n🔄 Generating comparative analysis...\n');
    comparativeSummary = await generateComparativeSummary(results.filter(r => !r.error));
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
      'FILE_READ_FAILED'
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
  --help                 Show this help message

Examples:
  node summarizer.js https://example.com --length short --metadata
  node summarizer.js --batch urls.txt --comparative --save report
  node summarizer.js https://example.com --follow 5 --save summary
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
          throw new SummarizerError('--save requires a filename', 'INVALID_ARGS');
        }
        options.saveToFile = args[++i];
        break;

      case '--batch':
        if (i + 1 >= args.length) {
          throw new SummarizerError('--batch requires a filename', 'INVALID_ARGS');
        }
        batchFile = args[++i];
        options.batch = true;
        break;

      case '--comparative':
        options.comparative = true;
        break;

      case '--follow':
        if (i + 1 >= args.length) {
          throw new SummarizerError('--follow requires a number', 'INVALID_ARGS');
        }
        const count = parseInt(args[++i], 10);
        if (isNaN(count) || count < 1 || count > 20) {
          throw new SummarizerError(
            'Follow count must be between 1 and 20',
            'INVALID_ARGS'
          );
        }
        options.followLinks = count;
        break;

      default:
        if (!args[i].startsWith('--')) {
          urls.push(args[i]);
        } else {
          throw new SummarizerError(
            `Unknown option: ${args[i]}. Use --help for usage information`,
            'INVALID_ARGS'
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
        'INVALID_ARGS'
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
