/**
 * Sanitization / normalization layer.
 *
 * Real regulatory feeds hand us status strings that are inconsistent
 * ("Pending ", "PENDING!!", "n/a", "", "In-Progress"), dates that are missing
 * or malformed, and text with stray HTML / whitespace garbage. This module's
 * job is to turn that into something the frontend can trust, WITHOUT ever
 * throwing -- a single bad record must never crash a list endpoint. Instead
 * we normalize what we can and flag what we can't, and surface *why*.
 */

import { z } from "zod";

export type DirectiveStatus = "ENACTED" | "PROPOSED" | "WITHDRAWN" | "UNKNOWN";
export type ActionItemStatus = "PENDING" | "IN_PROGRESS" | "RESOLVED" | "BLOCKED";
export type Priority = "LOW" | "MEDIUM" | "HIGH";

export interface NormalizationResult<T> {
  value: T;
  flagged: boolean;
  reason?: string;
}

/** Strip HTML tags, collapse whitespace, trim -- guards against malformed source text. */
export function sanitizeText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const DIRECTIVE_STATUS_MAP: Record<string, DirectiveStatus> = {
  enacted: "ENACTED",
  proposed: "PROPOSED",
  withdrawn: "WITHDRAWN",
};

export function normalizeDirectiveStatus(raw: string): NormalizationResult<DirectiveStatus> {
  const cleaned = sanitizeText(raw).toLowerCase().replace(/[^a-z]/g, "");
  const mapped = DIRECTIVE_STATUS_MAP[cleaned];
  if (mapped) return { value: mapped, flagged: false };
  return {
    value: "UNKNOWN",
    flagged: true,
    reason: `Unrecognized directive status "${raw}" could not be mapped to a known state.`,
  };
}

const ACTION_STATUS_MAP: Record<string, ActionItemStatus> = {
  pending: "PENDING",
  inprogress: "IN_PROGRESS",
  resolved: "RESOLVED",
  blocked: "BLOCKED",
};

export function normalizeActionItemStatus(raw: string): NormalizationResult<ActionItemStatus> {
  const cleaned = sanitizeText(raw).toLowerCase().replace(/[^a-z]/g, "");
  const mapped = ACTION_STATUS_MAP[cleaned];
  if (mapped) return { value: mapped, flagged: false };
  return {
    value: "PENDING",
    flagged: true,
    reason: `Unrecognized action item status "${raw}" defaulted to PENDING pending manual review.`,
  };
}

/** Returns null (never throws) when the date is missing or unparsable. */
export function parseDateSafe(input: Date | string | null | undefined): Date | null {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Detects the "conflicting status codes" edge case: a directive that is
 * WITHDRAWN or UNKNOWN should not have action items that are still
 * IN_PROGRESS or PENDING as if the directive were live. Called per-action-item
 * against its parent directive's normalized status.
 */
export function detectStatusConflict(
  directiveStatus: DirectiveStatus,
  actionStatus: ActionItemStatus
): string | null {
  if (
    (directiveStatus === "WITHDRAWN" || directiveStatus === "UNKNOWN") &&
    (actionStatus === "IN_PROGRESS" || actionStatus === "PENDING")
  ) {
    return `Parent directive is ${directiveStatus} but this action item is still ${actionStatus}.`;
  }
  return null;
}

// ---- Request-body validation (Zod) for write endpoints ----

export const updateActionItemSchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "RESOLVED", "BLOCKED"]).optional(),
  assignee: z.string().max(200).nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

export const listQuerySchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  flagged: z.enum(["true", "false"]).optional(),
  authorityId: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
