import express from "express";
import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { departments, subjects } from "../db/schema/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const currentPage = Math.max(1, Number(page));
    const limitPerPage = Math.max(1, Number(limit));
    const offset = (currentPage - 1) * limitPerPage;

    const filters = [];
    if (search) {
      filters.push(
        or(
          ilike(departments.name, `%${String(search)}%`),
          ilike(departments.code, `%${String(search)}%`),
        ),
      );
    }
    const whereClause = filters.length ? and(...filters) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(departments)
      .where(whereClause);

    const total = countResult[0]?.count ?? 0;

    const data = await db
      .select()
      .from(departments)
      .where(whereClause)
      .orderBy(desc(departments.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.json({
      data,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total,
        totalPages: Math.ceil(total / limitPerPage),
      },
    });
  } catch (error) {
    console.error("GET /departments error", error);
    res.status(500).json({ error: "Failed to fetch departments" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return res.status(400).json({ error: "Invalid id" });

    const record = await db
      .select()
      .from(departments)
      .where(eq(departments.id, id))
      .limit(1);

    if (!record.length) return res.status(404).json({ error: "Not found" });

    res.json({ data: record[0] });
  } catch (error) {
    console.error("GET /departments/:id error", error);
    res.status(500).json({ error: "Failed to fetch department" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, code, description } = req.body;
    if (!name || !code) {
      return res.status(400).json({ error: "name and code are required" });
    }

    const [created] = await db
      .insert(departments)
      .values({ name, code, description })
      .returning({ id: departments.id });

    res.status(201).json({ data: created });
  } catch (error) {
    console.error("POST /departments error", error);
    res.status(500).json({ error: "Failed to create department" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return res.status(400).json({ error: "Invalid id" });

    const { name, code, description } = req.body;
    const updated = await db
      .update(departments)
      .set({ name, code, description })
      .where(eq(departments.id, id))
      .returning({ id: departments.id });

    if (!updated.length) return res.status(404).json({ error: "Not found" });

    res.json({ data: updated[0] });
  } catch (error) {
    console.error("PUT /departments/:id error", error);
    res.status(500).json({ error: "Failed to update department" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return res.status(400).json({ error: "Invalid id" });

    const subjectCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(subjects)
      .where(eq(subjects.departmentId, id));

    if ((subjectCount[0]?.count ?? 0) > 0) {
      return res.status(409).json({
        error: "Cannot delete department while subjects exist",
      });
    }

    const deleted = await db.delete(departments).where(eq(departments.id, id));

    if (!deleted) return res.status(404).json({ error: "Not found" });

    res.status(204).send();
  } catch (error) {
    console.error("DELETE /departments/:id error", error);
    res.status(500).json({ error: "Failed to delete department" });
  }
});

export default router;
