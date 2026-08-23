const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.3 x 7.5
pres.author = "River Hub";
pres.title = "River Hub — Key Benefits";

// palette
const NAVY = "142C44";      // dark bg
const CARD = "1E3C58";      // card on dark
const LIGHT = "F4F8FB";     // light bg
const INK = "16293A";       // dark text on light
const MUTED = "5B7488";     // muted text on light
const ICE = "CADCFC";       // light text on dark
const TEAL = "1C7293";
const DEEP = "065A82";
const MINT = "2EC4B6";      // accent

const W = 13.3;
const sh = () => ({ type: "outer", color: "0A1622", blur: 9, offset: 3, angle: 90, opacity: 0.22 });
const shLight = () => ({ type: "outer", color: "8AA6BB", blur: 8, offset: 2, angle: 90, opacity: 0.25 });

function eyebrow(slide, dark) {
  slide.addText("RIVER HUB  ·  KEY BENEFITS", {
    x: 0.7, y: 0.42, w: 8, h: 0.35, margin: 0,
    fontFace: "Arial", fontSize: 12, bold: true, charSpacing: 3,
    color: dark ? MINT : TEAL, align: "left",
  });
}
function bignum(slide, n, dark) {
  slide.addText(n, {
    x: W - 2.4, y: 0.2, w: 1.9, h: 1.4, margin: 0,
    fontFace: "Arial", fontSize: 60, bold: true, align: "right",
    color: dark ? "27496B" : "DCE8F1",
  });
}

// ---------- Slide 1 (dark): one place for all the data ----------
let s = pres.addSlide();
s.background = { color: NAVY };
eyebrow(s, true); bignum(s, "01", true);
s.addText("One catchment, all the data", {
  x: 0.7, y: 1.05, w: 11.2, h: 0.9, margin: 0,
  fontFace: "Cambria", fontSize: 40, bold: true, color: "FFFFFF",
});
s.addText("Every fragmented public and citizen data source for a river — pulled together into one live, map-based view.", {
  x: 0.7, y: 2.0, w: 11.6, h: 0.7, margin: 0,
  fontFace: "Arial", fontSize: 17, color: ICE,
});
const sources = [
  ["Storm-overflow (EDM) spills", "Live Environment Agency sewage-discharge events and annual return totals."],
  ["Permits & WINEP", "Discharge permits and the water company's regulatory improvement obligations."],
  ["Water quality", "EA Water Quality Archive nutrients & bacteria, alongside citizen-science sampling."],
  ["Rainfall & river flow", "EA gauges for weather and flow context on every spill and result."],
];
const c1x = [0.7, 6.85], c1y = [3.0, 4.95], cw = 5.75, chh = 1.75;
sources.forEach((it, i) => {
  const x = c1x[i % 2], y = c1y[Math.floor(i / 2)];
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: cw, h: chh, rectRadius: 0.08, fill: { color: CARD }, shadow: sh() });
  s.addShape(pres.shapes.OVAL, { x: x + 0.32, y: y + 0.32, w: 0.34, h: 0.34, fill: { color: MINT } });
  s.addText(it[0], { x: x + 0.85, y: y + 0.26, w: cw - 1.1, h: 0.45, margin: 0, fontFace: "Arial", fontSize: 16, bold: true, color: "FFFFFF" });
  s.addText(it[1], { x: x + 0.85, y: y + 0.72, w: cw - 1.15, h: 0.9, margin: 0, fontFace: "Arial", fontSize: 12.5, color: ICE });
});
s.addNotes("River Hub's first benefit: it ends the data scavenger hunt. EA spill data, permits, WINEP, water quality and rainfall/flow normally live in separate portals and spreadsheets; River Hub unifies them per catchment.");

// ---------- Slide 2 (light): evidence ----------
s = pres.addSlide();
s.background = { color: LIGHT };
eyebrow(s, false); bignum(s, "02", false);
s.addText("Evidence, not just numbers", {
  x: 0.7, y: 1.05, w: 11.2, h: 0.9, margin: 0,
  fontFace: "Cambria", fontSize: 40, bold: true, color: INK,
});
s.addText("River Hub turns raw feeds into the analysis that builds the case for cleaner rivers.", {
  x: 0.7, y: 2.0, w: 11.6, h: 0.6, margin: 0, fontFace: "Arial", fontSize: 17, color: MUTED,
});
const feats = [
  ["Dry-weather spill detection", "Flags discharges with no rainfall to excuse them — the strongest signal of a failing asset."],
  ["Bathing-water classification", "Applies the EA percentile method to every monitored site, season-aware."],
  ["Treatment-works capacity", "Population demand vs permitted headroom — where the network is over capacity."],
  ["WINEP accountability", "Tracks the water company against its statutory improvement programme."],
];
let fy = 2.95; const frh = 0.98;
feats.forEach((it, i) => {
  s.addShape(pres.shapes.OVAL, { x: 0.8, y: fy + 0.06, w: 0.5, h: 0.5, fill: { color: i % 2 ? TEAL : DEEP } });
  s.addText(String(i + 1), { x: 0.8, y: fy + 0.06, w: 0.5, h: 0.5, margin: 0, align: "center", valign: "middle", fontFace: "Arial", fontSize: 18, bold: true, color: "FFFFFF" });
  s.addText(it[0], { x: 1.55, y: fy - 0.04, w: 11, h: 0.4, margin: 0, fontFace: "Arial", fontSize: 17, bold: true, color: INK });
  s.addText(it[1], { x: 1.55, y: fy + 0.36, w: 11.1, h: 0.5, margin: 0, fontFace: "Arial", fontSize: 13.5, color: MUTED });
  fy += frh;
});
s.addNotes("Benefit two: River Hub does the interpretation. Dry-spill detection, bathing-water classification, capacity headroom and WINEP tracking convert open data into an evidence base for advocacy and regulator engagement.");

// ---------- Slide 3 (light): transparency + stats ----------
s = pres.addSlide();
s.background = { color: LIGHT };
eyebrow(s, false); bignum(s, "03", false);
s.addText("Transparency for the community", {
  x: 0.7, y: 1.05, w: 11.2, h: 0.9, margin: 0,
  fontFace: "Cambria", fontSize: 40, bold: true, color: INK,
});
s.addText("Public, local and accountable — the data belongs to the people who live on the river.", {
  x: 0.7, y: 2.0, w: 7.4, h: 0.9, margin: 0, fontFace: "Arial", fontSize: 17, color: MUTED,
});
const pts = [
  ["Open public portal", "Pollution maps and per-site pages anyone can see — no login."],
  ["Council & parish views", "Every councillor and parish can see their own stretch of river."],
  ["Citizen science, side by side", "Volunteer testing shown alongside EA regulator data, not instead of it."],
];
let py = 3.05;
pts.forEach((it) => {
  s.addShape(pres.shapes.OVAL, { x: 0.82, y: py + 0.05, w: 0.26, h: 0.26, fill: { color: MINT } });
  s.addText(it[0], { x: 1.3, y: py - 0.12, w: 6.6, h: 0.4, margin: 0, fontFace: "Arial", fontSize: 16.5, bold: true, color: INK });
  s.addText(it[1], { x: 1.3, y: py + 0.28, w: 6.7, h: 0.55, margin: 0, fontFace: "Arial", fontSize: 13.5, color: MUTED });
  py += 1.15;
});
// stat callouts (right column)
const stats = [["2", "live river catchments"], ["175k+", "EA water-quality readings loaded"], ["100%", "open public access"]];
let stx = 8.55, stw = 4.05, sty = 2.5, sthh = 1.45;
stats.forEach((it, i) => {
  const y = sty + i * (sthh + 0.18);
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: stx, y, w: stw, h: sthh, rectRadius: 0.08, fill: { color: "FFFFFF" }, shadow: shLight() });
  s.addText(it[0], { x: stx + 0.3, y: y + 0.16, w: 1.85, h: 1.1, margin: 0, valign: "middle", fontFace: "Cambria", fontSize: 40, bold: true, color: i === 1 ? TEAL : DEEP });
  s.addText(it[1], { x: stx + 2.15, y: y + 0.16, w: 1.7, h: 1.1, margin: 0, valign: "middle", fontFace: "Arial", fontSize: 13, color: MUTED });
});
s.addNotes("Benefit three: transparency. The public portal, council/parish pages and the side-by-side citizen+regulator data make the river's health visible and local. Two catchments are live; ~175k EA water-quality readings loaded across them.");

// ---------- Slide 4 (dark): open + federated ----------
s = pres.addSlide();
s.background = { color: NAVY };
eyebrow(s, true); bignum(s, "04", true);
s.addText("Open, federated & built to replicate", {
  x: 0.7, y: 1.05, w: 11.6, h: 0.9, margin: 0,
  fontFace: "Cambria", fontSize: 40, bold: true, color: "FFFFFF",
});
s.addText("One codebase, any river — and no licence fees or lock-in.", {
  x: 0.7, y: 2.0, w: 11.6, h: 0.6, margin: 0, fontFace: "Arial", fontSize: 17, color: ICE,
});
const open = [
  ["Multi-tenant", "Dart and Teign run live from a single platform and codebase."],
  ["Config, not code", "A new catchment is a configuration file — not a rebuild."],
  ["Open-source (AGPL)", "No licence fees, no vendor lock-in; the method is auditable."],
  ["Low-cost cloud", "Runs on Next.js + Supabase — modest hosting, easy to operate."],
];
const o4x = [0.7, 6.85], o4y = [2.95, 4.7], ow = 5.75, ohh = 1.55;
open.forEach((it, i) => {
  const x = o4x[i % 2], y = o4y[Math.floor(i / 2)];
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: ow, h: ohh, rectRadius: 0.08, fill: { color: CARD }, shadow: sh() });
  s.addShape(pres.shapes.OVAL, { x: x + 0.32, y: y + 0.3, w: 0.34, h: 0.34, fill: { color: MINT } });
  s.addText(it[0], { x: x + 0.85, y: y + 0.24, w: ow - 1.1, h: 0.4, margin: 0, fontFace: "Arial", fontSize: 16, bold: true, color: "FFFFFF" });
  s.addText(it[1], { x: x + 0.85, y: y + 0.66, w: ow - 1.15, h: 0.75, margin: 0, fontFace: "Arial", fontSize: 12.5, color: ICE });
});
s.addText("From data to accountability — for every river.", {
  x: 0.7, y: 6.55, w: 11.9, h: 0.6, margin: 0, align: "center",
  fontFace: "Cambria", italic: true, fontSize: 19, bold: true, color: MINT,
});
s.addNotes("Closing benefit: River Hub is a reusable platform, not a one-off. Multi-tenant (Dart + Teign), config-driven onboarding, open-source under AGPL, and cheap to run — so any river group can stand one up. Close on the tagline.");

pres.writeFile({ fileName: "RiverHub_Key_Benefits.pptx" }).then((f) => console.log("wrote", f));
