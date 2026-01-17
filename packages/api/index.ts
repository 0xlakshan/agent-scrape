import express from "express";
import { chromium, Browser } from "playwright";
import { generateText, Output } from "ai";
import { google, createGoogleGenerativeAI } from "@ai-sdk/google";
import { jsonSchema } from "ai";

const app = express();
app.use(express.json());

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

function cleanHtml(html: string): string {
  return (
    html
      // Remove scripts, styles, comments
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(svg|path|iframe|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      // Remove common boilerplate sections
      .replace(/<(header|nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      // Strip most attributes, keep only semantic ones
      .replace(
        /\s+(class|id|style|data-[\w-]+|aria-[\w-]+|role|onclick|on\w+)="[^"]*"/gi,
        "",
      )
      // Remove empty tags
      .replace(/<(\w+)[^>]*>\s*<\/\1>/gi, "")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .replace(/>\s+</g, "><")
      .trim()
  );
}

function jsonToXml(obj: unknown, root = "root"): string {
  const convert = (data: unknown, tag: string): string => {
    if (Array.isArray(data)) {
      return data.map((item) => convert(item, "item")).join("");
    }
    if (typeof data === "object" && data !== null) {
      const inner = Object.entries(data)
        .map(([k, v]) => convert(v, k))
        .join("");
      return `<${tag}>${inner}</${tag}>`;
    }
    return `<${tag}>${String(data)}</${tag}>`;
  };
  return `<?xml version="1.0"?>${convert(obj, root)}`;
}

app.get("/health", (_, res) => res.json({ status: "ok" }));

app.post("/scrape", async (req, res) => {
  const {
    url,
    prompt,
    model,
    schema,
    output = "json",
    waitFor,
    timeout = 30000,
  } = req.body;

  if (!url || !prompt || !schema) {
    return res
      .status(400)
      .json({ error: "url, prompt, and schema are required" });
  }

  try {
    const b = await getBrowser();
    const page = await b.newPage();

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout });
      if (waitFor) await page.waitForTimeout(waitFor);

      const html = await page.textContent("body");

      // debugging
      // Write to file for debugging
      // const fs = await import("fs/promises");
      // await fs.writeFile("debug-output.txt", html || "", "utf-8");
      // console.log("Output written to debug-output.txt");
      // res.json({
      //   success: true,
      //   message: "Output written to debug-output.txt",
      // });

      const cleanedHtml = cleanHtml(html as string);

      const google = createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_API_KEY,
      });

      const result = await generateText({
        model: google(model),
        output: Output.object({ schema: jsonSchema(schema) }),
        prompt: `${prompt}\n\nHTML:\n${cleanedHtml}`,
      });

      if (output === "xml") {
        res.type("application/xml").send(jsonToXml(result, "result"));
      } else {
        res.json({ success: true, data: result });
      }
    } finally {
      await page.close();
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export function startServer(port = process.env.PORT || 3000) {
  const server = app.listen(port, () =>
    console.log(`Scrape API running on port ${port}`),
  );

  const shutdown = async () => {
    console.log("\nShutting down...");
    await closeBrowser();
    server.close(() => process.exit(0));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  return server;
}

export { app };

if (import.meta.url === `file://${process.argv[1]}`) startServer();
