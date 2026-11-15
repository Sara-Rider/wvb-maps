// WVB story card v4 — the biker-forward card (approved by Sara 14 Nov 2026).
// ---------------------------------------------------------------------------
// Spec: claude/WVB_StoryCardArt_Spec.md (WVB Business Brain project), section "Story card v4".
// 1200 × 630, one image per story: the Articles Hero Image and the link preview.
//
// Left: story-type label, the hook in Cinzel, a winding-road sign and the rider line.
// Right: the winged gear emblem (gear C: WEST VIRGINIA / BIKERS / gold WV ridge / BUILT BY RIDERS).
// Bottom: Sara's WV-mark ridge line across the card.
// The ground colour follows the story type. Nothing is random: same inputs, same image.
import { readFileSync } from "fs";
import { GEAR, RIDGE } from "./brand-paths.mjs";

export const SW = 1200, SH = 630;
const GOLD = "#c8922a", MIST = "#f2f0eb", ASPHALT = "#1a1a1a", CREAM = "#efe6d2";

// Story types. Label and ground colour are fixed per type; ask before adding one.
export const TYPES = {
  "road-food":      { label: "ROAD FOOD",      ground: GOLD,      ink: ASPHALT, hook: ASPHALT, line: ASPHALT, accent: ASPHALT, mark: GOLD,    wings: "charcoal", teeth: ASPHALT },
  "when-to-ride":   { label: "WHEN TO RIDE",   ground: "#1f3a10", ink: GOLD,    hook: MIST,    line: CREAM,   accent: GOLD,    mark: ASPHALT, wings: "cream",    teeth: CREAM },
  "worth-the-stop": { label: "WORTH THE STOP", ground: ASPHALT,   ink: GOLD,    hook: MIST,    line: CREAM,   accent: GOLD,    mark: ASPHALT, wings: "cream",    teeth: CREAM },
};

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const png = f => "data:image/png;base64," + readFileSync(new URL(`./assets/${f}`, import.meta.url)).toString("base64");

// Hook: largest Cinzel size (56, 48, 44, 41, 39) that fits in 3 lines of about 590 px.
// Cinzel 700 runs about 0.72 × font size per character.
function wrapHook(text) {
  const wrap = (t, m) => { const o = []; let l = ""; for (const w of t.split(/\s+/)) { if ((l + " " + w).trim().length > m && l) { o.push(l); l = w; } else l = (l + " " + w).trim(); } if (l) o.push(l); return o; };
  for (const size of [56, 48, 44, 41, 39]) {
    const lines = wrap(text, Math.floor(590 / (0.72 * size)));
    if (lines.length <= (size >= 48 ? 2 : 3)) return { size, lines };
  }
  throw new Error(`Hook too long for the card (3 lines at 39px): "${text}"`);
}

export function storyCardV4Svg({ slug, type, hook, line }) {
  const T = TYPES[type];
  if (!T) throw new Error(`${slug}: unknown story type "${type}" (use ${Object.keys(TYPES).join(", ")})`);
  if (!hook || !line) throw new Error(`${slug}: hook and line are both required`);
  const { size, lines } = wrapHook(hook);
  const labelY = 182, first = labelY + 20 + size, step = Math.round(size * 1.2);
  const last = first + step * (lines.length - 1), signY = last + 50; // centre of the road sign
  let s = `<rect width="${SW}" height="${SH}" fill="${T.ground}"/>`;
  // WV ridge line across the bottom
  s += `<path d="${RIDGE}" transform="translate(0 68) scale(1.5 0.72)" stroke="${T.accent}" stroke-width="10" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
  // Left column
  s += `<text x="72" y="${labelY}" fill="${T.ink}" font-family="Raleway" font-weight="700" font-size="22" letter-spacing="5">${T.label}</text>`;
  lines.forEach((l, i) => { s += `<text x="72" y="${first + i * step}" fill="${T.hook}" font-family="Cinzel" font-weight="700" font-size="${size}">${esc(l)}</text>`; });
  // Winding-road diamond sign, 34 px, then the rider line
  const cx = 89, cy = signY, k = 17;
  s += `<path d="M ${cx} ${cy - k} L ${cx + k} ${cy} L ${cx} ${cy + k} L ${cx - k} ${cy} Z" fill="${T.accent}"/>`;
  s += `<path d="M ${cx} ${(cy + 9.52).toFixed(2)} C ${cx - 6.12} ${(cy + 6.12).toFixed(2)} ${cx - 6.12} ${(cy + 2.04).toFixed(2)} ${cx} ${cy} C ${cx + 6.12} ${(cy - 2.04).toFixed(2)} ${cx + 6.12} ${(cy - 5.44).toFixed(2)} ${cx} ${(cy - 7.48).toFixed(2)}" stroke="${T.mark}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  s += `<path d="M ${cx} ${(cy - 11.56).toFixed(2)} L ${cx - 3.06} ${(cy - 6.8).toFixed(2)} L ${cx + 3.06} ${(cy - 6.8).toFixed(2)} Z" fill="${T.mark}"/>`;
  s += `<text x="120" y="${cy + 10}" fill="${T.line}" font-family="Raleway" font-weight="600" font-size="24" letter-spacing="1">${esc(line)}</text>`;
  // Winged gear emblem: gear 236 px at (812, 144); wings tight to the gear
  s += `<image href="${png(`wing-left-${T.wings}.png`)}" x="682.7" y="117.2" width="247.8" height="228.0"/>`;
  s += `<image href="${png(`wing-right-${T.wings}.png`)}" x="929.5" y="117.2" width="247.8" height="228.0"/>`;
  s += `<g transform="translate(812 144) scale(0.472)">`;
  s += `<circle cx="250" cy="250" r="225.6" fill="${T.teeth}"/><path d="${GEAR}" fill="${T.teeth}"/>`;
  s += `<circle cx="250" cy="250" r="213.6" fill="${ASPHALT}"/><circle cx="250" cy="250" r="199.2" fill="none" stroke="${GOLD}" stroke-width="5.3"/>`;
  s += `<defs><clipPath id="gearface"><circle cx="250" cy="250" r="196"/></clipPath></defs>`;
  s += `<text x="250" y="182" text-anchor="middle" fill="${MIST}" font-family="Cinzel" font-weight="700" font-size="28" letter-spacing="5">WEST VIRGINIA</text>`;
  s += `<text x="250" y="266" text-anchor="middle" fill="${MIST}" font-family="Cinzel" font-weight="700" font-size="72" letter-spacing="4">BIKERS</text>`;
  s += `<g clip-path="url(#gearface)"><path d="${RIDGE}" transform="translate(50 4) scale(0.5)" stroke="${GOLD}" stroke-width="18" fill="none" stroke-linejoin="round" stroke-linecap="round"/></g>`;
  s += `<text x="250" y="392" text-anchor="middle" fill="${GOLD}" font-family="Raleway" font-weight="700" font-size="16" letter-spacing="4">BUILT BY RIDERS</text>`;
  s += `</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${SW} ${SH}" width="${SW}" height="${SH}">${s}</svg>`;
}
