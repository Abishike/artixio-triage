import { Router } from "express";
import { prisma } from "../db.js";
import {
  normalizeActionItemStatus,
  normalizeDirectiveStatus,
  detectStatusConflict,
  sanitizeText,
  updateActionItemSchema,
  listQuerySchema,
} from "../validation.js";

export const actionItemsRouter = Router();

/**
 * GET /api/action-items
 * Supports filtering by status, priority, flagged, authorityId, and free-text search.
 * All filtering happens AFTER normalization so filters behave predictably even
 * though the underlying rawStatus values are inconsistent.
 */
actionItemsRouter.get("/", async (req, res) => {
  const parsedQuery = listQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({ error: "Invalid query parameters.", details: parsedQuery.error.flatten() });
  }
  const { status, priority, flagged, authorityId, search, page, pageSize } = parsedQuery.data;

  try {
    const rows = await prisma.actionItem.findMany({
      include: { directive: { include: { authority: true } } },
      orderBy: { createdAt: "asc" },
    });

    let result = rows.map((item) => {
      const directiveNorm = normalizeDirectiveStatus(item.directive.rawStatus);
      const actionNorm = normalizeActionItemStatus(item.rawStatus);
      const conflict = detectStatusConflict(directiveNorm.value, actionNorm.value);

      const flagReasons = [
        actionNorm.flagged ? actionNorm.reason : null,
        !item.dueDate ? "Due date is missing." : null,
        !item.assignee ? "No assignee set." : null,
        conflict,
      ].filter((r): r is string => Boolean(r));

      const isOverdue =
        item.dueDate && actionNorm.value !== "RESOLVED" && new Date(item.dueDate).getTime() < Date.now();
      if (isOverdue) flagReasons.push("Past due date and not yet resolved.");

      return {
        id: item.id,
        description: sanitizeText(item.description),
        assignee: item.assignee ? sanitizeText(item.assignee) : null,
        rawStatus: item.rawStatus,
        normalizedStatus: actionNorm.value,
        priority: item.priority,
        dueDate: item.dueDate,
        overdue: Boolean(isOverdue),
        flagged: flagReasons.length > 0,
        flagReasons,
        directive: {
          id: item.directive.id,
          referenceCode: item.directive.referenceCode,
          title: sanitizeText(item.directive.title),
          normalizedStatus: directiveNorm.value,
          authorityId: item.directive.authorityId,
          authorityName: item.directive.authority.name,
        },
      };
    });

    if (status) result = result.filter((r) => r.normalizedStatus === status.toUpperCase());
    if (priority) result = result.filter((r) => r.priority === priority.toUpperCase());
    if (flagged) result = result.filter((r) => r.flagged === (flagged === "true"));
    if (authorityId) result = result.filter((r) => r.directive.authorityId === authorityId);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.description.toLowerCase().includes(q) ||
          r.directive.title.toLowerCase().includes(q) ||
          r.directive.referenceCode.toLowerCase().includes(q)
      );
    }

    const total = result.length;
    const start = (page - 1) * pageSize;
    const paged = result.slice(start, start + pageSize);

    res.json({ data: paged, meta: { total, page, pageSize } });
  } catch (err) {
    console.error("GET /action-items failed:", err);
    res.status(500).json({ error: "Failed to load action items." });
  }
});

/**
 * PATCH /api/action-items/:id
 * Updates status / assignee / priority / dueDate on a single action item.
 * Body is strictly validated with Zod -- malformed updates are rejected with 400,
 * never allowed to silently corrupt the row.
 */
actionItemsRouter.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const parsed = updateActionItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid update payload.", details: parsed.error.flatten() });
  }

  const existing = await prisma.actionItem.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: "Action item not found." });
  }

  const { status, assignee, priority, dueDate } = parsed.data;

  try {
    const updated = await prisma.actionItem.update({
      where: { id },
      data: {
        ...(status ? { rawStatus: status } : {}),
        ...(assignee !== undefined ? { assignee } : {}),
        ...(priority ? { priority } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      },
    });
    res.json({ data: updated });
  } catch (err) {
    console.error("PATCH /action-items/:id failed:", err);
    res.status(500).json({ error: "Failed to update action item." });
  }
});
