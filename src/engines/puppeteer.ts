import puppeteer, { Browser } from 'puppeteer';
import { Engine, type EngineOptions, type RawContent } from '../types';

export class PuppeteerEngine extends Engine {
  private browser: Browser | null = null;

  private async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
    }
    return this.browser;
  }

  async scrape(url: string, options: EngineOptions = {}): Promise<RawContent> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle0', timeout: options.timeout ?? 30000 });

      if (options.waitFor) {
        await page.waitForSelector(options.waitFor, { timeout: 10000 });
      }

      return await page.evaluate((selectors?: string[]) => {
        const getMeta = (name: string) =>
          document.querySelector(`meta[name="${name}"], meta[property="og:${name}"]`)?.getAttribute('content') || '';

        let text = '';
        if (selectors?.length) {
          text = selectors.map(s => document.querySelector(s)?.textContent?.trim()).filter(Boolean).join('\n\n');
        } else {
          const main = document.querySelector('article, main, [role="main"], .content') as HTMLElement;
          text = main?.innerText || document.body.innerText;
        }

        return {
          html: document.documentElement.outerHTML,
          text: text.replace(/\n{3,}/g, '\n\n').trim(),
          metadata: { title: document.title || getMeta('title'), description: getMeta('description'), timestamp: new Date().toISOString() },
        };
      }, options.selectors);
    } finally {
      await page.close();
    }
  }

  async dispose(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
