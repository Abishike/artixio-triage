import express from "express";
import cors from "cors";
import { directivesRouter } from "./routes/directives.js";
import { actionItemsRouter } from "./routes/actionItems.js";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/directives", directivesRouter);
app.use("/api/action-items", actionItemsRouter);

// Fallback error handler -- guarantees the API never crashes the process on
// an unexpected error from a route; always returns structured JSON.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, () => {
  console.log(`Artixio triage API listening on http://localhost:${PORT}`);
});
