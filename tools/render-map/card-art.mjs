// WVB directory card art — direction E3 (region over county, one nameplate)
// -------------------------------------------------------------------------
// Spec: claude/WVB_DirectoryCardArt_Spec.md in the WVB Business Brain project.
// Reference render: "Directory Card Studies", section E3. This file is a port
// of that page's artRidge(r, {plate:"e3"}) and must stay byte-for-byte equal in
// output. THE ORDER OF rnd() CALLS IS PART OF THE SPEC — add or move one and
// every card in the directory changes.
//
// A generated landscape, not a map. No network, no map service, no licence.
// Inputs: slug, latitude, longitude, county, travel region. Nothing else.

export const W = 800;
export const H = 500;

const GOLD = "#c8922a";
const MIST = "#f2f0eb";
const ASPHALT = "#1a1a1a";

export const COLOURWAYS = {
  "New River-Greenbrier Valley": { sky: "#e9e4d6", far: "#7b8a6f", mid: "#4d6540", near: "#2d5016" },
  "Potomac Highlands":           { sky: "#e4e6e5", far: "#8398a4", mid: "#547381", near: "#3d5a6b" },
  "Mountaineer Country":         { sky: "#efe9da", far: "#bda471", mid: "#9a7c40", near: "#6b5526" },
  "Hatfield-McCoy Mountains":    { sky: "#e6e3da", far: "#727f77", mid: "#45544d", near: "#23312c" },
  "Mountain Lakes":              { sky: "#e5eae6", far: "#889d93", mid: "#587362", near: "#32473b" },
  "Metro Valley":                { sky: "#eae7e0", far: "#8f9089", mid: "#60635b", near: "#353731" },
  "Mid-Ohio Valley":             { sky: "#ece7db", far: "#9ea48f", mid: "#6d765c", near: "#424835" },
  "Eastern Panhandle":           { sky: "#ece8e2", far: "#9e9296", mid: "#70646a", near: "#423a41" },
  "Northern Panhandle":          { sky: "#e8e9e7", far: "#91989c", mid: "#626b70", near: "#383f43" },
  "Out of State":                { sky: "#eae8e4", far: "#9b948c", mid: "#6e675f", near: "#403a34" },
};
// Spec: an unmatched or blank region falls back to Metro Valley.
export const FALLBACK_REGION = "Metro Valley";

function seedOf(slug, lat, lng) {
  let h = 2166136261;
  const s = slug + "|" + lat.toFixed(6) + "|" + lng.toFixed(6);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function ridgePath(rnd, baseY, amp, rough, fill) {
  const harm = [
    { a: amp,              f: 0.7 + rnd() * 0.5, p: rnd() * Math.PI * 2 },
    { a: amp * 0.42,       f: 1.6 + rnd() * 0.9, p: rnd() * Math.PI * 2 },
    { a: amp * 0.16,       f: 3.0 + rnd() * 1.4, p: rnd() * Math.PI * 2 },
    { a: amp * rough * 0.4, f: 5.5 + rnd() * 2.5, p: rnd() * Math.PI * 2 },
  ];
  let d = `M 0 ${H} L 0 ${baseY.toFixed(1)}`;
  for (let x = 0; x <= W; x += 8) {
    const t = x / W;
    let y = baseY;
    for (const h of harm) y += h.a * Math.sin(h.f * Math.PI * 2 * t + h.p);
    d += ` L ${x} ${y.toFixed(1)}`;
  }
  d += ` L ${W} ${H} Z`;
  return `<path d="${d}" fill="${fill}"/>`;
}

// County text: the stored value is the bare county ("Tucker"); strip a
// trailing " County" anyway so a typed "Tucker County" never prints twice.
export function countyLabel(county) {
  return String(county || "").replace(/\s+county\s*$/i, "").trim().toUpperCase() + " COUNTY";
}

export function resolveRegion(region) {
  const r = String(region || "").trim();
  return COLOURWAYS[r] ? r : FALLBACK_REGION;
}

// Returns the card as an SVG string in the 800x500 drawing space.
// `region` is printed verbatim (uppercased) on the nameplate; the colourway
// falls back to Metro Valley if it is not one of the ten known regions.
export function cardSvg({ slug, lat, lng, county, region }) {
  const c = COLOURWAYS[resolveRegion(region)];
  const regionText = String(region || "").trim() || FALLBACK_REGION;
  const rnd = mulberry32(seedOf(slug, lat, lng));

  let s = `<rect width="${W}" height="${H}" fill="${c.sky}"/>`;
  const sunX = 120 + Math.abs(lng * 100 % 1) * 560, sunY = 96 + Math.abs(lat * 100 % 1) * 40;
  s += `<circle cx="${sunX.toFixed(0)}" cy="${sunY.toFixed(0)}" r="46" fill="${GOLD}" opacity="0.16"/>`;
  s += ridgePath(rnd, 240 + rnd() * 30, 46, 0.30, c.far);
  s += ridgePath(rnd, 320 + rnd() * 26, 40, 0.42, c.mid);
  const ry = 398 + rnd() * 18, sweep = (rnd() * 160 - 80).toFixed(0);
  s += `<path d="M -20 ${(ry + 52).toFixed(0)} C ${W * 0.3} ${(ry + +sweep).toFixed(0)}, ${W * 0.66} ${(ry - +sweep).toFixed(0)}, ${W + 20} ${(ry - 34).toFixed(0)}" fill="none" stroke="${GOLD}" stroke-width="7" opacity="0.9" stroke-linecap="round"/>`;
  s += ridgePath(rnd, 412 + rnd() * 22, 30, 0.55, c.near);

  s += `<rect x="0" y="${H - 124}" width="${W}" height="124" fill="${ASPHALT}" opacity="0.9"/>`;
  s += `<rect x="0" y="${H - 124}" width="${W}" height="4" fill="${GOLD}"/>`;
  s += `<text x="36" y="${H - 72}" fill="${GOLD}" font-family="Raleway" font-size="23" font-weight="600" letter-spacing="4.4">${esc(regionText.toUpperCase())}</text>`;
  s += `<text x="36" y="${H - 24}" fill="${MIST}" font-family="Raleway" font-size="38" font-weight="700" letter-spacing="4.2">${esc(countyLabel(county))}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${s}</svg>`;
}
