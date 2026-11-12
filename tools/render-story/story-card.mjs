// WVB story card — the multi-colour card every story uses (decided 21 Oct 2026).
// ---------------------------------------------------------------------------
// Spec: claude/WVB_StoryCardArt_Spec.md in the WVB Business Brain project.
// Recovered 12 Nov 2026 from the session that designed it ("Editorial content
// integration", 21 Oct), where it lived as statewide-card.mjs and was never saved.
// Proven byte-identical against the two live site cards (The Custard Stand,
// Chasing fall color). THE ORDER OF rnd() CALLS IS PART OF THE SPEC.
//
// A companion to card-art.mjs (the directory card), which it imports W and H from
// and otherwise leaves untouched. Same frame: sky, sun, ridges, gold road, asphalt
// nameplate. The ridges carry five region colours instead of one colourway.
//
// Nameplate:
//   plate given          -> plate[0] / plate[1]          (one region: REGION / COUNTY)
//   regions === "all"    -> WEST VIRGINIA / STATEWIDE
//   regions === n        -> MULTI-REGION / n REGIONS
import { W, H } from "../render-map/card-art.mjs";
const GOLD = "#c8922a", MIST = "#f2f0eb", ASPHALT = "#1a1a1a", SKY = "#ebe9e3";
const RIDGES = ["#9a9fa2", "#547381", "#bda471", "#4d6540", "#2f3330"]; // gray, blue, gold, green, charcoal
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function seedOf(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function ridge(rnd, baseY, amp, rough, fill){
  const hs=[{a:amp,f:.7+rnd()*.5,p:rnd()*6.283},{a:amp*.42,f:1.6+rnd()*.9,p:rnd()*6.283},{a:amp*.16,f:3+rnd()*1.4,p:rnd()*6.283},{a:amp*rough*.4,f:5.5+rnd()*2.5,p:rnd()*6.283}];
  let d=`M 0 ${H} L 0 ${baseY.toFixed(1)}`;
  for(let x=0;x<=W;x+=8){let y=baseY;for(const h of hs)y+=h.a*Math.sin(h.f*6.283*x/W+h.p);d+=` L ${x} ${y.toFixed(1)}`;}
  return `<path d="${d} L ${W} ${H} Z" fill="${fill}"/>`;
}
// Site card: art and nameplate only, no title. Goes in the Articles Hero Image.
export function statewideCardSvg({ slug = "statewide", regions = "all", plate } = {}) {
  const rnd = mulberry32(seedOf(slug));
  let s = `<rect width="${W}" height="${H}" fill="${SKY}"/>`;
  s += `<circle cx="${(160 + rnd()*480).toFixed(0)}" cy="${(100 + rnd()*30).toFixed(0)}" r="46" fill="${GOLD}" opacity="0.16"/>`;
  const bases = [186, 232, 276, 318], amps = [44, 40, 36, 32], rough = [.25, .32, .4, .48];
  for (let i = 0; i < 4; i++) s += ridge(rnd, bases[i] + rnd()*20, amps[i], rough[i], RIDGES[i]);
  const ry = 398 + rnd()*18, sw = (rnd()*160 - 80).toFixed(0);
  s += `<path d="M -20 ${(ry+52).toFixed(0)} C ${W*.3} ${(ry + +sw).toFixed(0)}, ${W*.66} ${(ry - +sw).toFixed(0)}, ${W+20} ${(ry-34).toFixed(0)}" fill="none" stroke="${GOLD}" stroke-width="7" opacity="0.9" stroke-linecap="round"/>`;
  s += ridge(rnd, 352 + rnd()*14, 26, .55, RIDGES[4]);
  const all = regions === "all";
  s += `<rect x="0" y="${H-124}" width="${W}" height="124" fill="${ASPHALT}" opacity="0.9"/><rect x="0" y="${H-124}" width="${W}" height="4" fill="${GOLD}"/>`;
  s += `<text x="36" y="${H-72}" fill="${GOLD}" font-family="Raleway" font-size="23" font-weight="600" letter-spacing="4.4">${plate ? esc(plate[0].toUpperCase()) : all ? "WEST VIRGINIA" : "MULTI-REGION"}</text>`;
  s += `<text x="36" y="${H-24}" fill="${MIST}" font-family="Raleway" font-size="38" font-weight="700" letter-spacing="4.2">${plate ? esc(plate[1].toUpperCase()) : all ? "STATEWIDE" : esc(regions + " REGIONS")}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${s}</svg>`;
}
// Share card: the site card plus the theme label, title and hook over the sky.
export function statewideStoryCardSvg({ slug, regions, title, hook, label, plate }) {
  const wrap=(t,m)=>{const o=[];let l="";for(const w of t.split(/\s+/)){if((l+" "+w).trim().length>m&&l){o.push(l);l=w;}else l=(l+" "+w).trim();}if(l)o.push(l);return o;};
  const T=title.toUpperCase(); let lines=wrap(T,26); const n=Math.min(lines.length,3);
  for(let m=Math.ceil(T.length/n);m<=26;m++){const t2=wrap(T,m);if(t2.length<=n){lines=t2;break;}} lines=lines.slice(0,3);
  let t=`<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SKY}" stop-opacity="0.96"/><stop offset="0.7" stop-color="${SKY}" stop-opacity="0.85"/><stop offset="1" stop-color="${SKY}" stop-opacity="0"/></linearGradient></defs>`;
  t+=`<rect width="${W}" height="${190+lines.length*45}" fill="url(#fade)"/>`;
  t+=`<text x="36" y="58" fill="${GOLD}" font-family="Raleway" font-size="18" font-weight="700" letter-spacing="3.6">${esc(label.toUpperCase())}</text>`;
  lines.forEach((l,i)=>{t+=`<text x="36" y="${112+i*50}" fill="${ASPHALT}" font-family="Cinzel" font-size="42" font-weight="700" letter-spacing="1">${esc(l)}</text>`;});
  if(hook)t+=`<text x="36" y="${112+lines.length*50}" fill="${ASPHALT}" font-family="Raleway" font-size="22" font-weight="600" opacity="0.8">${esc(hook)}</text>`;
  return statewideCardSvg({ slug, regions, plate }).replace(/<\/svg>$/, t + "</svg>");
}

// ---------------------------------------------------------------------------
// Social-safe story card — 1200 × 630 (decided 12 Nov 2026).
// One image per story: the Articles Hero Image AND the link preview (og:image)
// on Facebook, messaging apps and search. 1.91:1 is the link-preview shape.
// Safe zone: the site's story cards crop it to about 1.6:1 (≈96px off each
// side), so the nameplate text starts at x = 140. Same seed and draw order as
// the 800 × 500 card, with every coordinate scaled to the wider frame.
// No title on the image: link previews print the title and description below it.
export const SW = 1200, SH = 630;
function ridgeWide(rnd, baseY, amp, rough, fill){
  const hs=[{a:amp,f:.7+rnd()*.5,p:rnd()*6.283},{a:amp*.42,f:1.6+rnd()*.9,p:rnd()*6.283},{a:amp*.16,f:3+rnd()*1.4,p:rnd()*6.283},{a:amp*rough*.4,f:5.5+rnd()*2.5,p:rnd()*6.283}];
  let d=`M 0 ${SH} L 0 ${baseY.toFixed(1)}`;
  for(let x=0;x<=SW;x+=10){let y=baseY;for(const h of hs)y+=h.a*Math.sin(h.f*6.283*x/SW+h.p);d+=` L ${x} ${y.toFixed(1)}`;}
  return `<path d="${d} L ${SW} ${SH} Z" fill="${fill}"/>`;
}
export function storyCardSvg({ slug = "statewide", regions = "all", plate } = {}) {
  const rnd = mulberry32(seedOf(slug)), ky = SH / 500 * 0.92; // art band is a little shorter: the nameplate takes more height
  let s = `<rect width="${SW}" height="${SH}" fill="${SKY}"/>`;
  s += `<circle cx="${(240 + rnd()*720).toFixed(0)}" cy="${(110 + rnd()*36).toFixed(0)}" r="58" fill="${GOLD}" opacity="0.16"/>`;
  const bases = [186, 232, 276, 318], amps = [44, 40, 36, 32], rough = [.25, .32, .4, .48];
  for (let i = 0; i < 4; i++) s += ridgeWide(rnd, (bases[i] + rnd()*20) * ky, amps[i] * ky, rough[i], RIDGES[i]);
  const ry = (398 + rnd()*18) * ky, sw = (rnd()*160 - 80) * ky;
  s += `<path d="M -30 ${(ry+52*ky).toFixed(0)} C ${SW*.3} ${(ry + sw).toFixed(0)}, ${SW*.66} ${(ry - sw).toFixed(0)}, ${SW+30} ${(ry-34*ky).toFixed(0)}" fill="none" stroke="${GOLD}" stroke-width="9" opacity="0.9" stroke-linecap="round"/>`;
  s += ridgeWide(rnd, (352 + rnd()*14) * ky, 26 * ky, .55, RIDGES[4]);
  const all = regions === "all", P = 160; // nameplate panel height
  s += `<rect x="0" y="${SH-P}" width="${SW}" height="${P}" fill="${ASPHALT}" opacity="0.9"/><rect x="0" y="${SH-P}" width="${SW}" height="5" fill="${GOLD}"/>`;
  s += `<text x="140" y="${SH-P+62}" fill="${GOLD}" font-family="Raleway" font-size="30" font-weight="600" letter-spacing="5.6">${plate ? esc(plate[0].toUpperCase()) : all ? "WEST VIRGINIA" : "MULTI-REGION"}</text>`;
  s += `<text x="140" y="${SH-P+124}" fill="${MIST}" font-family="Raleway" font-size="50" font-weight="700" letter-spacing="5.4">${plate ? esc(plate[1].toUpperCase()) : all ? "STATEWIDE" : esc(regions + " REGIONS")}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SW} ${SH}" width="${SW}" height="${SH}">${s}</svg>`;
}
