import { INSTANCE } from "@/lib/instance";

/**
 * Cookie-free Umami tracker (INSTANCE.umami). Renders nothing unless a website id is configured;
 * `data-domains` limits counting to the live host so previews and local runs send nothing.
 * Used by both the per-river public layout and the national (home + district) layout.
 */
export default function UmamiScript() {
  if (!INSTANCE.umami.websiteId) return null;
  return (
    <script
      defer
      src={INSTANCE.umami.src}
      data-website-id={INSTANCE.umami.websiteId}
      data-domains={INSTANCE.umami.domains || undefined}
    />
  );
}
