import { describe, it, expect, vi, beforeEach } from "vitest";
import { Scraper } from "./sdk";

const mockRawContent = {
  html: "<html><body>Test</body></html>",
  text: "Test content",
  metadata: {
    title: "Test",
    description: "Test desc",
    timestamp: "2024-01-01T00:00:00.000Z",
  },
};

vi.stubGlobal("fetch", vi.fn());

beforeEach(() => {
  vi.mocked(fetch).mockReset();
});

describe("Scraper", () => {
  it("scrapes URL via API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: mockRawContent }),
    } as Response);

    const scraper = new Scraper();
    const result = await scraper.scrape("https://example.com");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/scrape",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          url: "https://example.com",
          selectors: undefined,
        }),
      }),
    );
    expect(result.content).toBe("Test content");
    expect(result.format).toBe("text");
  });

  it("passes selectors to API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: mockRawContent }),
    } as Response);

    const scraper = new Scraper();
    await scraper.scrape("https://example.com", { selectors: [".content"] });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/scrape",
      expect.objectContaining({
        body: JSON.stringify({
          url: "https://example.com",
          selectors: [".content"],
        }),
      }),
    );
  });

  it("retries on failure", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockRawContent }),
      } as Response);

    const scraper = new Scraper({ retry: { attempts: 2, delay: 10 } });
    const result = await scraper.scrape("https://example.com");

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.content).toBe("Test content");
  });

  it("throws after max retries", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

    const scraper = new Scraper({ retry: { attempts: 2, delay: 10 } });

    await expect(scraper.scrape("https://example.com")).rejects.toThrow(
      "Failed after 2 attempts",
    );
  });

  it("scrapes batch of URLs", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: mockRawContent }),
    } as Response);

    const scraper = new Scraper();
    const results = await scraper.scrapeBatch([
      "https://a.com",
      "https://b.com",
    ]);

    expect(results).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("applies postProcess function", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: mockRawContent }),
    } as Response);

    const scraper = new Scraper();
    const result = await scraper.scrape("https://example.com", {
      postProcess: (data) => ({ ...data, content: data.content.toUpperCase() }),
    });

    expect(result.content).toBe("TEST CONTENT");
  });
});
