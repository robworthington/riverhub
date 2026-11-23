"use client";

import { useEffect, useId, useRef, useState } from "react";

// One Share button per page that has a card (canvas "Sharing controls"). Phones get the system share
// sheet with the card image attached, so people reach the apps they actually use; desktops (and phones
// whose browser can't share files) get a small panel: the card, an editable message, one link per
// channel and an image download. Every link is tagged with where it was shared and which card, so
// visits arriving from shares can be counted (cookie-free; no personal data in the link). Captions are
// factual and hashtag-free; nothing is tagged automatically.

export type ShareCardKind = "live" | "overflow" | "england";

type Channel = { id: string; label: string; href: (url: string, text: string, subject: string) => string };

const CHANNELS: Channel[] = [
  { id: "whatsapp", label: "WhatsApp", href: (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}` },
  { id: "facebook", label: "Facebook", href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { id: "x", label: "X", href: (u, t) => `https://x.com/intent/post?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}` },
  { id: "bluesky", label: "Bluesky", href: (u, t) => `https://bsky.app/intent/compose?text=${encodeURIComponent(`${t} ${u}`)}` },
  { id: "email", label: "Email", href: (u, t, subj) => `mailto:?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(`${t}\n\n${u}`)}` },
];

/** The page URL tagged for one channel and card type (UTM, read by any analytics without cookies). */
export function taggedUrl(path: string, channel: string, card: ShareCardKind): string {
  const u = new URL(path, typeof window !== "undefined" ? window.location.origin : "https://riverhub.org");
  u.searchParams.set("utm_source", channel);
  u.searchParams.set("utm_medium", "share");
  u.searchParams.set("utm_campaign", card);
  return u.toString();
}

export function ShareButton({
  path, title, text, card, subject, className = "",
}: {
  /** The page to share, as a path ("/r/dart/explore/spills"). */
  path: string;
  /** Panel heading: "Share the Dart, right now". */
  title: string;
  /** Default message; the person can edit it. */
  text: string;
  /** Email subject (defaults to "River Hub"). */
  subject?: string;
  card: ShareCardKind;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(text);
  const [copied, setCopied] = useState(false);
  // The page's own card, from its og:image tag: Next names the image route with a build hash
  // (opengraph-image-<hash>), so the head is the reliable source. Same-origin path keeps fetch simple.
  const [imagePath, setImagePath] = useState<string | null>(null);
  useEffect(() => {
    const c = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content;
    if (!c) return;
    try {
      const u = new URL(c, window.location.origin);
      setImagePath(u.pathname + u.search);
    } catch { /* no card */ }
  }, []);
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMessage(text), [text]);

  // Close on Escape or a click outside; return focus to the button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); buttonRef.current?.focus(); }
    };
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open]);

  async function onShare() {
    // Phones: the system sheet, with the card attached where the browser allows files.
    const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    if (coarse && typeof navigator !== "undefined" && navigator.share) {
      const url = taggedUrl(path, "native", card);
      try {
        let files: File[] | undefined;
        try {
          if (!imagePath) throw new Error("no card");
          const blob = await fetch(imagePath).then((r) => (r.ok ? r.blob() : Promise.reject()));
          const f = new File([blob], "river-hub.png", { type: blob.type || "image/png" });
          if (navigator.canShare?.({ files: [f] })) files = [f];
        } catch { /* share without the image */ }
        await navigator.share({ title, text: message, url, ...(files ? { files } : {}) });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return; // the person closed the sheet
        // any other failure falls through to the panel
      }
    }
    setOpen((o) => !o);
  }

  async function copyLink() {
    const url = taggedUrl(path, "copy", card);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={onShare}
        aria-expanded={open}
        aria-controls={panelId}
        data-umami-event="share-open"
        data-umami-event-card={card}
        className="inline-flex items-center gap-2 rounded-[6px] border border-brand-navy bg-white px-3.5 py-2 text-[14px] font-semibold text-brand-navy hover:bg-brand-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-navy"
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="M12 3v13" /><path d="m7 8 5-5 5 5" />
        </svg>
        Share
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={title}
          className="absolute right-0 z-50 mt-2 w-[min(92vw,400px)] space-y-3.5 rounded-[8px] border border-brand-line2 bg-white p-4 text-left shadow-[0_8px_28px_rgba(18,49,75,.18)]"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-serif text-[18px] font-bold text-brand-navyDeep">{title}</h2>
            <button
              type="button"
              onClick={() => { setOpen(false); buttonRef.current?.focus(); }}
              aria-label="Close"
              className="-mr-1 -mt-1 rounded px-2 py-0.5 text-[18px] leading-none text-brand-label hover:text-brand-navy"
            >
              ×
            </button>
          </div>
          {imagePath && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagePath} alt="" width={1200} height={630} className="h-auto w-full rounded-[6px] border border-brand-line2" />
          )}
          <label className="block space-y-1.5">
            <span className="text-[12.5px] font-semibold text-brand-text">Message (you can edit it)</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full rounded-[6px] border border-brand-line2 px-2.5 py-2 text-[13.5px] leading-[1.5] text-brand-text focus:border-brand-navy focus:outline-none"
            />
          </label>
          <ul className="grid grid-cols-3 gap-2">
            {CHANNELS.map((c) => (
              <li key={c.id}>
                <a
                  href={c.href(taggedUrl(path, c.id, card), message, subject ?? "River Hub")}
                  target={c.id === "email" ? undefined : "_blank"}
                  rel="noopener noreferrer"
                  data-umami-event="share"
                  data-umami-event-channel={c.id}
                  data-umami-event-card={card}
                  className="block rounded-[6px] bg-brand-surface px-2 py-2 text-center text-[13px] font-semibold text-brand-navy hover:bg-brand-band focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-navy"
                >
                  {c.label}
                </a>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={copyLink}
                data-umami-event="share"
                data-umami-event-channel="copy"
                data-umami-event-card={card}
                className="w-full rounded-[6px] bg-brand-navyDeep px-2 py-2 text-[13px] font-semibold text-white hover:bg-brand-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-navy"
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </li>
          </ul>
          <p aria-live="polite" className="sr-only">{copied ? "Link copied" : ""}</p>
          {imagePath && <p className="text-[12.5px] text-brand-body">
            Download image:{" "}
            <a
              href={imagePath}
              download="river-hub.png"
              data-umami-event="share"
              data-umami-event-channel="download"
              data-umami-event-card={card}
              className="font-semibold text-brand-navy hover:underline"
            >
              Link card (1200×630)
            </a>
          </p>}
        </div>
      )}
    </div>
  );
}
