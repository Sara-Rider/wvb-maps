// WVB story cards. Spec: claude/WVB_StoryCardArt_Spec.md (WVB Business Brain project).
// Usage: node render.mjs <spec.json> <outdir>
// spec: [{slug, regions, plate?, title, hook, label}]  -> <slug>-card-site.png and <slug>-card-share.png
// Before any batch, prove the build: re-render the-custard-stand and check its SHA-256 (see the spec).
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { statewideCardSvg, statewideStoryCardSvg } from "./story-card.mjs";
const F = new URL("./node_modules/@expo-google-fonts/", import.meta.url).pathname;
const fonts = { fontFiles: [F+"raleway/600SemiBold/Raleway_600SemiBold.ttf", F+"raleway/700Bold/Raleway_700Bold.ttf", F+"cinzel/700Bold/Cinzel_700Bold.ttf"], loadSystemFonts: false, defaultFontFamily: "Raleway" };
const [spec, out = "out"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const png = (svg, f) => writeFileSync(`${out}/${f}`, new Resvg(svg, { font: fonts }).render().asPng());
for (const c of JSON.parse(readFileSync(spec, "utf8"))) {
  png(statewideCardSvg(c), `${c.slug}-card-site.png`);
  if (c.title) png(statewideStoryCardSvg(c), `${c.slug}-card-share.png`);
  console.log(c.slug);
}
