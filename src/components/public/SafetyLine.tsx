// The line that sits with every live spill count (SAS review): a spill tells you an overflow is
// discharging, not whether the water is safe. Swimming decisions belong to Surfers Against Sewage's
// Safer Seas & Rivers Service, which models health risk at bathing spots.
export const SAFER_SEAS_URL = "https://www.sas.org.uk/water-quality/sewage-pollution-alerts/";

export function SafetyLine({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[12.5px] leading-[1.5] text-brand-body ${className}`}>
      A spill isn&rsquo;t a water-quality test. Swimming? Check the{" "}
      <a
        href={SAFER_SEAS_URL}
        target="_blank"
        rel="noopener noreferrer"
        data-umami-event="safer-seas"
        className="font-semibold text-brand-navy underline-offset-2 hover:underline"
      >
        Safer Seas &amp; Rivers Service
      </a>
      .
    </p>
  );
}
