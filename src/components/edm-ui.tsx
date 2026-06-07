import type { AssetType } from "@/lib/types";
import type { WeatherClass } from "@/lib/dryspill";

export function assetTypeLabel(t: AssetType | null): string {
  switch (t) {
    case "combined_sewer_overflow":
      return "Combined sewer overflow";
    case "sewage_treatment_works":
      return "Sewage treatment works";
    case "pumping_station":
      return "Pumping station";
    case "storm_tank":
      return "Storm tank";
    default:
      return "—";
  }
}

export function WeatherBadge({ weatherClass }: { weatherClass: WeatherClass }) {
  const map: Record<WeatherClass, { label: string; cls: string }> = {
    dry: { label: "Dry spill", cls: "bg-red-100 text-red-700" },
    wet: { label: "Wet", cls: "bg-green-100 text-green-700" },
    unknown: { label: "No rain data", cls: "bg-gray-100 text-gray-500" },
  };
  const { label, cls } = map[weatherClass];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

export function StatusBadge({ status }: { status: number | null }) {
  let label = "Unknown";
  let cls = "bg-gray-100 text-gray-600";
  if (status === 1) {
    label = "Spilling";
    cls = "bg-red-100 text-red-700";
  } else if (status === 0) {
    label = "Not spilling";
    cls = "bg-green-100 text-green-700";
  } else if (status === -1) {
    label = "Monitor offline";
    cls = "bg-amber-100 text-amber-700";
  }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
