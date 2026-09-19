import { Router } from "express";
import { prisma } from "../db.js";
import { normalizeDirectiveStatus, sanitizeText } from "../validation.js";

export const directivesRouter = Router();

/**
 * GET /api/directives
 * Returns all directives with normalized status computed on the fly.
 * Never throws on bad data -- worst case a record is flagged as UNKNOWN.
 */
directivesRouter.get("/", async (_req, res) => {
  try {
    const rows = await prisma.complianceDirective.findMany({
      include: { authority: true, _count: { select: { actionItems: true } } },
      orderBy: { createdAt: "asc" },
    });

    const result = rows.map((d) => {
      const norm = normalizeDirectiveStatus(d.rawStatus);
      const flagged = norm.flagged || !d.effectiveDate;
      const reasons = [
        norm.flagged ? norm.reason : null,
        !d.effectiveDate ? "Effective date is missing." : null,
      ].filter(Boolean);

      return {
        id: d.id,
        authority: { id: d.authority.id, name: d.authority.name, country: d.authority.country },
        referenceCode: d.referenceCode,
        title: sanitizeText(d.title),
        summary: d.summary ? sanitizeText(d.summary) : null,
        rawStatus: d.rawStatus,
        normalizedStatus: norm.value,
        effectiveDate: d.effectiveDate,
        actionItemCount: d._count.actionItems,
        flagged,
        flagReasons: reasons,
      };
    });

    res.json({ data: result });
  } catch (err) {
    console.error("GET /directives failed:", err);
    res.status(500).json({ error: "Failed to load directives." });
  }
});
