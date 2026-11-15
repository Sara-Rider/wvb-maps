// WVB story cards. Spec: claude/WVB_StoryCardArt_Spec.md (WVB Business Brain project).
// Usage: node render.mjs <spec.json> <outdir>          -> <slug>-card.png, 1200 × 630 (Hero Image + link preview)
//        node render.mjs <spec.json> <outdir> --legacy -> the old 800 × 500 <slug>-card-site.png, kept only for the proof check
// spec rows:
//   v4 card (from 14 Nov 2026): {slug, type, hook, line}  type = road-food | when-to-ride | worth-the-stop
//   multi-colour card (retired from the site, kept for the proof check): {slug, regions, plate?}
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { statewideCardSvg, storyCardSvg } from "./story-card.mjs";
import { storyCardV4Svg } from "./story-card-v4.mjs";
const F = new URL("./node_modules/@expo-google-fonts/", import.meta.url).pathname;
const fonts = { fontFiles: [F+"raleway/600SemiBold/Raleway_600SemiBold.ttf", F+"raleway/700Bold/Raleway_700Bold.ttf", F+"cinzel/700Bold/Cinzel_700Bold.ttf"], loadSystemFonts: false, defaultFontFamily: "Raleway" };
const [spec, out = "out", mode] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const png = (svg, f) => writeFileSync(`${out}/${f}`, new Resvg(svg, { font: fonts }).render().asPng());
for (const c of JSON.parse(readFileSync(spec, "utf8"))) {
  if (mode === "--legacy") png(statewideCardSvg(c), `${c.slug}-card-site.png`);
  else if (c.type) png(storyCardV4Svg(c), `${c.slug}-card.png`);
  else png(storyCardSvg(c), `${c.slug}-card.png`);
  console.log(c.slug);
}
