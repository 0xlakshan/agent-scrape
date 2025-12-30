import puppeteer, { Page } from 'puppeteer';
import { BrowserContext, PageMetadata, SummarizerError } from './types';
import { removeDuplicateLines } from './utils';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

export async function createBrowserContext(): Promise<BrowserContext> {
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

export async function withBrowser<T>(
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

export async function navigate(page: Page, url: string): Promise<void> {
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

export async function extractMetadata(page: Page): Promise<PageMetadata> {
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

export async function extractLinks(page: Page, baseUrl: string): Promise<string[]> {
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

export async function extractAndCleanText(page: Page): Promise<string> {
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
