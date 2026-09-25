import { INSTANCE } from "@/lib/instance";
import {
  PETITION_URL,
  RESPONSE_THRESHOLD,
  DEBATE_THRESHOLD,
  getPetition,
} from "@/lib/petition";

// The primary public call to action: back the national petition. A live signature count and progress
// bar (to 10k for a Government response, then 100k for a debate) turn it into a visible, moving number.
// Renders nothing until the petition is published (getPetition returns null while it is in moderation),
// so the board/asset pages carry no dead CTA before it goes live.
//
// variant "full"    — the board's closing CTA (full argument + counter + button)
// variant "compact" — an asset page's "what you can do", as one more lever alongside the local steps
export async function PetitionCta({
  variant = "full",
  evidence,
}: {
  variant?: "full" | "compact";
  evidence?: string;
}) {
  const petition = PETITION_URL ? await getPetition() : null;
  if (!petition || !PETITION_URL) return null;

  const count = petition.signatureCount;
  const past10k = count >= RESPONSE_THRESHOLD;
  const target = past10k ? DEBATE_THRESHOLD : RESPONSE_THRESHOLD;
  const targetNote = past10k ? "to be considered for debate" : "for a Government response";
  const pct = Math.min(100, Math.max(1, Math.round((count / target) * 100)));

  const Counter = (
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="font-plexmono text-[16px] font-bold text-rh-ink">{count.toLocaleString()}</span>
        <span className="text-rh-ink3">of {target.toLocaleString()} {targetNote}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-rh-cardAlt">
        <div className="h-full rounded-full bg-rh-teal" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );

  const SignButton = (
    <a
      href={PETITION_URL}
      target="_blank"
      rel="noopener"
      className="mt-3 inline-flex rounded-[4px] bg-rh-teal px-5 py-2.5 text-[14px] font-semibold text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rh-teal"
    >
      Sign the petition ↗
    </a>
  );

  if (variant === "compact") {
    return (
      <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-rh-teal bg-rh-card px-[22px] py-5">
        <h2 className="text-[17px] font-bold text-rh-ink">Put this on the national record</h2>
        <p className="mt-1.5 max-w-[680px] text-[13px] leading-[1.55] text-rh-ink2">
          This is the fastest way to act on what you have seen. Our petition asks the Government to
          publish a fix-by date and yearly progress for every storm overflow. At {DEBATE_THRESHOLD.toLocaleString()}{" "}
          signatures it must be considered for debate in Parliament.
        </p>
        {Counter}
        {SignButton}
      </div>
    );
  }

  return (
    <div className="rounded-[3px] border border-rh-line border-l-[4px] border-l-rh-teal bg-rh-card px-[26px] py-6">
      <div className="font-plexmono text-[11px] font-semibold uppercase tracking-[.08em] text-rh-label">
        The fastest lever
      </div>
      <h2 className="mt-1 text-[19px] font-bold text-rh-ink">Sign the petition for a debate in Parliament</h2>
      <p className="mt-2 max-w-[760px] text-[13.5px] leading-[1.6] text-rh-ink2">
        A petition is a public number the Government has to answer. This one asks for the single thing
        this site keeps running into: a published fix-by date and yearly progress for every storm
        overflow, so anyone can see whether theirs is being dealt with. Today the plan sets deadlines by
        category, never by overflow, and reports no progress on any of them.
      </p>
      {evidence && (
        <p className="mt-2 max-w-[760px] text-[13.5px] leading-[1.6] text-rh-ink">{evidence}</p>
      )}
      {Counter}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {SignButton}
        <span className="text-[12px] text-rh-ink3">
          {RESPONSE_THRESHOLD.toLocaleString()} signatures forces a Government response;{" "}
          {DEBATE_THRESHOLD.toLocaleString()} must be considered for debate in Parliament.
        </span>
      </div>
      <p className="mt-3 max-w-[760px] text-[12.5px] text-rh-ink3">
        Sign it, then send it to three people who swim, paddle, fish or walk the {INSTANCE.riverName}.
        That is how a local record becomes a national question.
      </p>
    </div>
  );
}
