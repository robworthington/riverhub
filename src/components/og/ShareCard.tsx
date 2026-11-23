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
};

export function ShareCard(p: ShareCardProps) {
  const serif = p.hasFonts ? "Source Serif 4" : "serif";
  const mono = p.hasFonts ? "IBM Plex Mono" : "monospace";
  const sans = p.hasFonts ? "IBM Plex Sans" : "sans-serif";
  const fg = p.dark ? "#FFFFFF" : "#12314B";
  const muted = p.dark ? "#C6D7E4" : "#5B6E7E";
  const sub = p.dark ? "#C6D7E4" : "#3C5566";
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: p.dark ? "#12314B" : "#FFFFFF", fontFamily: sans }}>
      {!p.dark && <div style={{ width: 28, height: "100%", backgroundColor: p.accent }} />}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 64px 52px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 30, fontWeight: 700, letterSpacing: 3.5, textTransform: "uppercase", color: p.accent }}>
            {p.liveDot && <div style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: p.accent, marginRight: 16 }} />}
            {p.kicker}
          </div>
          <div style={{ display: "flex", fontFamily: serif, fontSize: 40, fontWeight: 700, color: fg }}>River Hub</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {p.eyebrow && (
            <div style={{ display: "flex", fontFamily: serif, fontSize: 42, fontWeight: 700, color: sub, marginBottom: 10 }}>{p.eyebrow}</div>
          )}
          <div style={{ display: "flex", alignItems: "baseline", fontFamily: mono, fontWeight: 700, lineHeight: 1 }}>
            <span style={{ fontSize: 132, color: p.numberColor ?? p.accent }}>{p.number}</span>
            {p.numberSuffix && <span style={{ fontFamily: sans, fontSize: 56, color: sub, marginLeft: 22 }}>{p.numberSuffix}</span>}
          </div>
          <div style={{ display: "flex", fontFamily: serif, fontSize: 52, fontWeight: 700, lineHeight: 1.15, color: fg, marginTop: 14, maxWidth: 1040 }}>
            {p.sentence}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", fontSize: 27, lineHeight: 1.4, color: muted }}>
          <div style={{ display: "flex" }}>{p.footer}</div>
          {p.footer2 && <div style={{ display: "flex" }}>{p.footer2}</div>}
        </div>
      </div>
    </div>
  );
}
