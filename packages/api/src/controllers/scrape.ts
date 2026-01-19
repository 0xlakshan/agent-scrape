import type { Request, Response } from "express";
import { generateText, Output } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { jsonSchema } from "ai";
import type {
  ScrapeRequestBody,
  ScrapeResponse,
  ErrorResponse,
} from "../types";
import { ScrapeEngine } from "../scrapeEngine/scrapeEngine";
import jsonToXml from "../utils/jsonToXml";

const scrapeEngine = new ScrapeEngine();

export async function scrapeController(
  req: Request<{}, ScrapeResponse | ErrorResponse, ScrapeRequestBody>,
  res: Response<ScrapeResponse | ErrorResponse>,
): Promise<void> {
  const {
    url,
    prompt,
    model,
    schema,
    output = "json",
    waitFor,
    timeout = 30000,
  } = req.body;

  if (!url || !prompt || !schema || !model) {
    res
      .status(400)
      .json({ error: "url, prompt, schema and model are required" });
    return;
  }

  try {
    const { cleanedHtml } = await scrapeEngine.scrape({
      url,
      waitFor,
      timeout,
    });

    // Write to a file for debugging
    // const fs = await import("fs/promises");
    // await fs.writeFile("debug-output.txt", cleanedHtml || "", "utf-8");
    // console.log("Output written to debug-output.txt");

    const google = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_API_KEY,
    });

    const result = await generateText({
      model: google(model),
      output: Output.object({ schema: jsonSchema(schema) }),
      prompt: `${prompt}\n\nHTML:\n${cleanedHtml}`,
    });

    if (output === "xml") {
      // TODO: Return proper XML
      res.type("application/xml").send({
        success: true,
        data: jsonToXml(result, "result"),
      });
    } else {
      res.json({ success: true, data: result });
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function closeScraper(): Promise<void> {
  await scrapeEngine.closeBrowser();
}
{
  jsonToXml;
}
