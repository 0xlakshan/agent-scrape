import { Scraper } from "../../dist/index.mjs";
import { z } from "zod";

const scraper = new Scraper();

const result = await scraper.scrape(
  "https://www.temu.com/lk-en/channel/full-star.html?scene=home_title_bar_five_star&refer_page_el_sn=206751&_x_vst_scene=adg&_x_ads_channel=google&_x_ads_sub_channel=search&_x_ads_account=1217118478&_x_ads_set=22016546348&_x_ads_id=171921720653&_x_ads_creative_id=725119842673&_x_ns_source=g&_x_ns_gclid=Cj0KCQiAg63LBhDtARIsAJygHZ7iSu9kT-Q8Rum9PUKTph16HhJWWWUy1V8RcO-KJy8GxHmCGC4ZxI4aAsq3EALw_wcB&_x_ns_placement=&_x_ns_match_type=e&_x_ns_ad_position=&_x_ns_product_id=&_x_ns_target=&_x_ns_devicemodel=&_x_ns_wbraid=CkAKCAiA4KfLBhAaEjAAOBjX-cKbYjL5ZHMrXMTOKnAr4ejznJuJVPtG5Fs_o80gsSKwEfjv2x38nSn6rkkaAlXI&_x_ns_gbraid=0AAAAAo4mICGLje-yyGfIs2s_LkHjoJu1c&_x_ns_keyword=temu&_x_ns_targetid=kwd-4583699489&_x_ns_extensionid=&_x_sessn_id=cfb1kav615&refer_page_name=goods&refer_page_id=10032_1768658558323_qbq0m5z7u6&refer_page_sn=10032",
  {
    model: "gemini-2.0-flash-lite",
    prompt: "get my first 5 products",
    schema: z.object({
      name: z.string().describe("name of the product"),
      price: z.number().describe("numeric price without currency"),
    }),
    waitFor: 5000,
  },
);

console.log(result);
