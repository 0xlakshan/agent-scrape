import { Scraper } from "../../dist/index.mjs";
import { z } from "zod";

const scraper = new Scraper();

const scrappingResult = await scraper.scrape(
  "https://www.tripadvisor.com/Attractions-g293961-Activities-c26-t142-Sri_Lanka.html",
  {
    model: "gemini-2.0-flash-lite",
    prompt: "get me top rating destinations",
    schema: z.object({
      name: z.string().describe("name of the destination"),
      rating: z.number().describe("rating of the destination"),
    }),
    waitFor: 5000,
  },
);
console.log(scrappingResult);

// const tokenUsageResult = await scraper.getTokenUsage(
//   "https://explodingtopics.com/",
//   {
//     prompt: "what are the best performing markets",
//     model: "gemini-2.0-flash-exp",
//     schema: z.object({
//       first: z.string().describe("name of the frist best performing market"),
//       second: z.string().describe("name of the frist best performing market"),
//       third: z.string().describe("name of the frist best performing market"),
//       fourth: z.string().describe("name of the frist best performing market"),
//     }),
//   },
// );
// console.log(tokenUsageResult);
