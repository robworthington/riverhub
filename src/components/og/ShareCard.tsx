// Layout for the 1200×630 share cards (canvas "Share cards"): one number, one sentence, a time and a
// source. Rendered by next/og (Satori), so only inline styles and flex layout, and every element with
// more than one child needs display:flex.

export type ShareCardProps = {
  /** "Live · River Dart" */
  kicker: string;
  /** Draw the live dot before the kicker (the ● glyph isn't in the card fonts). */
  liveDot?: boolean;
  /** Accent for the stripe, kicker and number. */
  accent: string;
  numberColor?: string;
  /** Optional line above the number, e.g. the overflow's name. */
  eyebrow?: string;
  number: string;
  /** Smaller text after the number: "of 51", "hours". */
  numberSuffix?: string;
  sentence: string;
  /** Source/time line; a second line is the safety line on live cards. */
  footer: string;
  footer2?: string;
  /** Dark (England) variant. */
  dark?: boolean;
  hasFonts: boolean;
  /** A river photo for the right-hand panel, with its credit (loadCardPhoto). */
  photo?: { src: string; credit: string } | null;
};

const PHOTO_W = 430;

export function ShareCard(p: ShareCardProps) {
  const serif = p.hasFonts ? "Source Serif 4" : "serif";
  const mono = p.hasFonts ? "IBM Plex Mono" : "monospace";
  const sans = p.hasFonts ? "IBM Plex Sans" : "sans-serif";
  const fg = p.dark ? "#FFFFFF" : "#12314B";
  const muted = p.dark ? "#C6D7E4" : "#5B6E7E";
  const sub = p.dark ? "#C6D7E4" : "#3C5566";
  // With a photo the text column narrows, so the type steps down a size.
  const ph = p.photo ?? null;
  const textW = ph ? 1200 - 28 - PHOTO_W : 1172;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: p.dark ? "#12314B" : "#FFFFFF", fontFamily: sans }}>
      {!p.dark && <div style={{ width: 28, height: "100%", backgroundColor: p.accent }} />}
      <div style={{ width: textW, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: ph ? "48px 44px 44px 52px" : "56px 64px 52px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: ph ? 24 : 30, fontWeight: 700, letterSpacing: ph ? 2.5 : 3.5, textTransform: "uppercase", color: p.accent }}>
            {p.liveDot && <div style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: p.accent, marginRight: 16 }} />}
            {p.kicker}
          </div>
          {!ph && <div style={{ display: "flex", fontFamily: serif, fontSize: 40, fontWeight: 700, color: fg, marginLeft: 20 }}>River Hub</div>}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {p.eyebrow && (
            <div style={{ display: "flex", fontFamily: serif, fontSize: ph ? 34 : 42, fontWeight: 700, color: sub, marginBottom: 10 }}>{p.eyebrow}</div>
          )}
          <div style={{ display: "flex", alignItems: "baseline", fontFamily: mono, fontWeight: 700, lineHeight: 1 }}>
            <span style={{ fontSize: ph ? 116 : 132, color: p.numberColor ?? p.accent }}>{p.number}</span>
            {p.numberSuffix && <span style={{ fontFamily: sans, fontSize: ph ? 46 : 56, color: sub, marginLeft: 20 }}>{p.numberSuffix}</span>}
          </div>
          <div style={{ display: "flex", fontFamily: serif, fontSize: ph ? 42 : 52, fontWeight: 700, lineHeight: 1.15, color: fg, marginTop: 14, maxWidth: ph ? textW - 96 : 1040 }}>
            {p.sentence}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", fontSize: ph ? 22 : 27, lineHeight: 1.4, color: muted }}>
          <div style={{ display: "flex" }}>{p.footer}</div>
          {p.footer2 && <div style={{ display: "flex" }}>{p.footer2}</div>}
        </div>
      </div>
      {ph && (
        <div style={{ width: PHOTO_W, height: "100%", display: "flex", position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ph.src} width={PHOTO_W} height={630} style={{ width: PHOTO_W, height: 630, objectFit: "cover" }} alt="" />
          {/* with a photo, the wordmark sits on it so the text column keeps its width */}
          <div style={{ position: "absolute", top: 40, right: 0, display: "flex", padding: "8px 22px", backgroundColor: "rgba(255, 255, 255, 0.92)", fontFamily: serif, fontSize: 34, fontWeight: 700, color: "#12314B" }}>
            River Hub
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", padding: "10px 16px", backgroundColor: "rgba(12, 28, 42, 0.72)", color: "#FFFFFF", fontSize: 18 }}>
            {ph.credit}
          </div>
        </div>
      )}
    </div>
  );
}
