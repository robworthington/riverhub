// Group roles and tasks (migration 0126, ROLES-AND-GROUPS-SPEC.md). Safe to import on the client.
// The database is the authority (has_task() in RLS); this is for menus, buttons and page gates.

export const TASKS = [
  "data_entry",
  "sampling",
  "photos",
  "requests",
  "regulatory",
  "comms",
  "membership",
  "settings",
] as const;
export type Task = (typeof TASKS)[number];

export const BASE_ROLES = ["lead", "coordinator", "volunteer", "viewer"] as const;
export type BaseRole = (typeof BASE_ROLES)[number];

export const TASK_LABELS: Record<Task, { label: string; hint: string }> = {
  data_entry: { label: "Data entry", hint: "Enter results and import spreadsheets" },
  sampling: { label: "Sampling", hint: "Manage sampling sites and test types; correct results" },
  photos: { label: "Photos", hint: "Approve river photos and deal with photo reports" },
  requests: { label: "Requests", hint: "Publish and delete FOI/EIR requests" },
  regulatory: { label: "Regulatory", hint: "Edit overflows, systems and permits; link WINEP measures" },
  comms: { label: "Comms", hint: "Edit the group's public profile and donate link" },
  membership: { label: "Membership", hint: "Invite people and change roles and tasks" },
  settings: { label: "Settings", hint: "Group settings, API keys and the sync buttons" },
};

export const BASE_ROLE_LABELS: Record<BaseRole, string> = {
  lead: "Lead",
  coordinator: "Coordinator",
  volunteer: "Volunteer",
  viewer: "Viewer",
};

/** The starting task list for a base role (mirrors default_tasks() in SQL). */
export function defaultTasks(role: BaseRole): Task[] {
  if (role === "lead") return [...TASKS];
  if (role === "coordinator") return ["data_entry", "sampling", "photos", "requests"];
  if (role === "volunteer") return ["data_entry"];
  return [];
}

export function hasAnyTask(tasks: readonly string[] | undefined, ...want: Task[]): boolean {
  return !!tasks && want.some((t) => tasks.includes(t));
}
