export type NormalizedStatus = "PENDING" | "IN_PROGRESS" | "RESOLVED" | "BLOCKED";
export type Priority = "LOW" | "MEDIUM" | "HIGH";

export interface ActionItemDTO {
  id: string;
  description: string;
  assignee: string | null;
  rawStatus: string;
  normalizedStatus: NormalizedStatus;
  priority: Priority;
  dueDate: string | null;
  overdue: boolean;
  flagged: boolean;
  flagReasons: string[];
  directive: {
    id: string;
    referenceCode: string;
    title: string;
    normalizedStatus: string;
    authorityId: string;
    authorityName: string;
  };
}

export interface ListResponse<T> {
  data: T[];
  meta: { total: number; page: number; pageSize: number };
}

const BASE = "/api";

export interface ActionItemFilters {
  status?: string;
  priority?: string;
  flagged?: "true" | "false";
  search?: string;
}

export async function fetchActionItems(filters: ActionItemFilters): Promise<ListResponse<ActionItemDTO>> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  params.set("pageSize", "200");

  const res = await fetch(`${BASE}/action-items?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch action items (${res.status})`);
  return res.json();
}

export interface ActionItemUpdate {
  status?: NormalizedStatus;
  assignee?: string | null;
  priority?: Priority;
}

export async function updateActionItem(id: string, update: ActionItemUpdate) {
  const res = await fetch(`${BASE}/action-items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  if (!res.ok) throw new Error(`Failed to update action item (${res.status})`);
  return res.json();
}
