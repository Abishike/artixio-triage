/**
 * Seeds the database with mock regulatory data that intentionally includes
 * real-world messiness:
 *   1. Missing critical dates       (effectiveDate / dueDate = null)
 *   2. Conflicting status codes     (withdrawn directive, still-pending action items)
 *   3. Malformed text               (stray HTML, ALL CAPS, extra whitespace)
 *   4. Duplicate reference codes    (two directives sharing "EMA-2026-0143")
 *   5. Garbage / unmapped status strings ("n/a", "", "withdrawn!!", "In-Progress ")
 *
 * Run with: npm run seed
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Clearing existing data...");
  await prisma.actionItem.deleteMany();
  await prisma.complianceDirective.deleteMany();
  await prisma.regulatoryAuthority.deleteMany();

  console.log("Seeding authorities...");
  const fda = await prisma.regulatoryAuthority.create({
    data: {
      name: "U.S. Food and Drug Administration",
      country: "United States",
      website: "https://www.fda.gov",
      contactEmail: "regops@fda.gov",
    },
  });

  const ema = await prisma.regulatoryAuthority.create({
    data: {
      name: "European Medicines Agency",
      country: "European Union",
      website: "https://www.ema.europa.eu",
      contactEmail: null, // missing contact -- fine, non-critical field
    },
  });

  const mhra = await prisma.regulatoryAuthority.create({
    data: {
      name: "Medicines and Healthcare products Regulatory Agency",
      country: "United Kingdom",
      website: "https://www.gov.uk/mhra",
      contactEmail: "info@mhra.gov.uk",
    },
  });

  const pmda = await prisma.regulatoryAuthority.create({
    data: {
      name: "Pharmaceuticals and Medical Devices Agency",
      country: "Japan",
      website: null,
      contactEmail: null,
    },
  });

  console.log("Seeding directives (with intentional messiness)...");

  const directives = await Promise.all([
    // Clean record -- control case
    prisma.complianceDirective.create({
      data: {
        authorityId: fda.id,
        referenceCode: "FDA-2026-1042",
        title: "Updated Labeling Requirements for Biosimilar Products",
        summary: "New guidance on comparative labeling for biosimilar and interchangeable products.",
        rawStatus: "Enacted",
        effectiveDate: new Date("2026-03-01"),
        rawText: "Final rule published in the Federal Register.",
      },
    }),
    // Missing critical date
    prisma.complianceDirective.create({
      data: {
        authorityId: ema.id,
        referenceCode: "EMA-2026-0143",
        title: "Pharmacovigilance Reporting Timelines Revision",
        summary: "Revises timelines for adverse event reporting across member states.",
        rawStatus: "Proposed",
        effectiveDate: null, // MESSY: effective date not yet set but referenced downstream
        rawText: "Draft circulated to stakeholders for comment.",
      },
    }),
    // Duplicate reference code (shares EMA-2026-0143 with above) -- data entry collision
    prisma.complianceDirective.create({
      data: {
        authorityId: ema.id,
        referenceCode: "EMA-2026-0143",
        title: "Cold Chain Storage Standards for Biologics   ",
        summary: "  Storage and transport temperature requirements.  <br/> Supersedes 2019 guidance.",
        rawStatus: "enacted",
        effectiveDate: new Date("2026-06-15"),
        rawText: "<p>Adopted by the Committee for Medicinal Products for Human Use.</p>",
      },
    }),
    // Garbage / unmapped status string
    prisma.complianceDirective.create({
      data: {
        authorityId: mhra.id,
        referenceCode: "MHRA-2026-0087",
        title: "POST-BREXIT CLINICAL TRIAL AUTHORISATION FRAMEWORK",
        summary: "Framework replacing EU CTR for UK-based trials.",
        rawStatus: "withdrawn!!", // MESSY: garbage punctuation, won't map cleanly
        effectiveDate: new Date("2025-11-01"),
        rawText: "Status uncertain pending parliamentary review -- source feed inconsistent.",
      },
    }),
    // Empty status string
    prisma.complianceDirective.create({
      data: {
        authorityId: pmda.id,
        referenceCode: "PMDA-2026-0021",
        title: "Real-World Evidence Submission Standards",
        summary: null, // missing summary, non-critical
        rawStatus: "", // MESSY: empty string
        effectiveDate: null, // MESSY: also missing date
        rawText: null,
      },
    }),
    // "n/a" status, malformed HTML-laced title
    prisma.complianceDirective.create({
      data: {
        authorityId: fda.id,
        referenceCode: "FDA-2026-1108",
        title: "<b>Accelerated Approval</b> Pathway Amendments   \n\n  ",
        summary: "Amendments to confirmatory trial requirements for accelerated approvals.",
        rawStatus: "n/a", // MESSY: not a real status
        effectiveDate: new Date("2026-09-01"),
        rawText: "Source feed returned 'n/a' for status field -- likely an ingestion bug upstream.",
      },
    }),
    // Clean proposed directive
    prisma.complianceDirective.create({
      data: {
        authorityId: mhra.id,
        referenceCode: "MHRA-2026-0093",
        title: "Post-Market Surveillance Reporting Portal Migration",
        summary: "Migration of PMS reporting to the new digital portal.",
        rawStatus: "Proposed",
        effectiveDate: new Date("2027-01-15"),
        rawText: "Consultation open through Q4 2026.",
      },
    }),
  ]);

  console.log("Seeding action items (including status conflicts)...");

  const [
    biosimilar,
    pharmacovigilance,
    coldChain,
    clinicalTrial,
    rwe,
    accelerated,
    pmsPortal,
  ] = directives;

  await prisma.actionItem.createMany({
    data: [
      // Clean
      {
        directiveId: biosimilar.id,
        description: "Review labeling templates against new comparative claims language.",
        assignee: "R. Alvarez",
        rawStatus: "Resolved",
        priority: "MEDIUM",
        dueDate: new Date("2026-02-15"),
      },
      // Missing due date
      {
        directiveId: pharmacovigilance.id,
        description: "Confirm updated adverse event reporting SLA with EU affiliates.",
        assignee: "T. Nguyen",
        rawStatus: "Pending",
        priority: "HIGH",
        dueDate: null, // MESSY: no due date set, directive itself has no effective date either
      },
      // CONFLICT: directive is WITHDRAWN (garbage status maps to UNKNOWN) but this item is "in progress"
      {
        directiveId: clinicalTrial.id,
        description: "Update SOP for UK trial authorisation submissions.",
        assignee: "J. Okafor",
        rawStatus: "In-Progress ",
        priority: "HIGH",
        dueDate: new Date("2025-12-01"), // due date in the past relative to withdrawal -- also worth flagging
      },
      // CONFLICT: directive status is empty/UNKNOWN, action item still "pending"
      {
        directiveId: rwe.id,
        description: "Draft internal guidance memo on RWE submission format.",
        assignee: null, // MESSY: unassigned
        rawStatus: "pending",
        priority: "MEDIUM",
        dueDate: new Date("2026-10-30"),
      },
      // Garbage status string on the action item itself
      {
        directiveId: accelerated.id,
        description: "Coordinate with clinical ops on confirmatory trial design changes.",
        assignee: "M. Chen",
        rawStatus: "blocked??", // MESSY: won't map cleanly, defaults to PENDING + flagged
        priority: "HIGH",
        dueDate: new Date("2026-11-20"),
      },
      // Clean, resolved
      {
        directiveId: coldChain.id,
        description: "Audit warehouse temperature logs against new storage bands.",
        assignee: "S. Patel",
        rawStatus: "RESOLVED",
        priority: "LOW",
        dueDate: new Date("2026-07-01"),
      },
      // Clean
      {
        directiveId: pmsPortal.id,
        description: "Migrate historical PMS records to new portal schema.",
        assignee: "A. Dubois",
        rawStatus: "pending",
        priority: "MEDIUM",
        dueDate: new Date("2026-12-31"),
      },
      // Duplicate-reference-code directive's own item, empty assignee + far past due date (overdue edge case)
      {
        directiveId: coldChain.id,
        description: "Notify distribution partners of revised cold chain SLAs.",
        assignee: "",
        rawStatus: "Pending",
        priority: "HIGH",
        dueDate: new Date("2026-01-05"), // already overdue relative to "today" in the app
      },
    ],
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
