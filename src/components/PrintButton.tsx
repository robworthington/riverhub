"use client";

export function PrintButton({ label = "Print / save as PDF" }: { label?: string }) {
  return (
    <button onClick={() => window.print()} className="btn-secondary no-print text-sm">
      {label}
    </button>
  );
}
