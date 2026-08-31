// Statutory calendar for the spills section (regulatory restructure, screen 8). Dates are static;
// the countdown is computed at render. `unverified` marks a date the FoD reference report flagged as
// needing reconfirmation before it is relied on publicly.

export type CalendarEntry = {
  date: string; // ISO — for sorting and the countdown
  display: string; // human label
  approximate?: boolean; // window, not a fixed day → no countdown
  what: string;
  status: "statutory" | "forthcoming";
  unverified?: boolean;
};

export const CALENDAR: CalendarEntry[] = [
  { date: "2026-10-15", display: "15 Oct 2026", what: "Bathing-water designation application deadline for the 2027 season.", status: "forthcoming", unverified: true },
  { date: "2026-10-01", display: "Autumn 2026", approximate: true, what: "Ofwat's first PR24 delivery assessment.", status: "forthcoming" },
  { date: "2026-12-01", display: "Dec 2026", approximate: true, what: "Draft River Basin Management Plan — six-month consultation opens.", status: "statutory" },
  { date: "2027-04-01", display: "1 Apr 2027", what: "First pollution incident reduction plan implementation reports.", status: "statutory" },
  { date: "2027-04-30", display: "30 Apr 2027", what: "Latest allowable completion date for catchment investigations feeding the 2030–35 programme.", status: "statutory" },
  { date: "2027-11-01", display: "1 Nov 2027", what: "South West Water's draft Drainage & Wastewater Management Plan — twelve-week consultation.", status: "statutory" },
  { date: "2027-12-22", display: "22 Dec 2027", what: "Final River Basin Management Plans published.", status: "statutory" },
];
