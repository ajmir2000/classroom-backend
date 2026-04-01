import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import express from "express";
import { subjects, departments, classes } from "../db/schema/index.js";
import { db } from "../db/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { search, department, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
    const limitPerPage = Math.max(
      Math.max(1, parseInt(String(limit), 10) || 10),
      100,
    );

    const offset = (currentPage - 1) * limitPerPage;
    const filterConditions = [];

    if (search) {
      filterConditions.push(
        or(
          ilike(subjects.name, `%${search}%`),
          ilike(subjects.code, `%${search}%`),
        ),
      );
    }

    if (department) {
      const deptPattern = `%${String(department).replace(/[%_]/g, "\\$&")}%`;
      filterConditions.push(ilike(departments.name, deptPattern));
    }

    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(whereClause);

    const totalCount = countResult[0]?.count ?? 0;

    const subjectsList = await db
      .select({
        ...getTableColumns(subjects),
        department: { ...getTableColumns(departments) },
      })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(whereClause)
      .orderBy(desc(subjects.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.json({
      data: subjectsList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (e) {
    console.error(`Error fetching subjects: ${e}`);
    res.status(500).json({ error: "Failed to get subjects" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return res.status(400).json({ error: "Invalid id" });

    const [subject] = await db
      .select({
        ...getTableColumns(subjects),
        department: { ...getTableColumns(departments) },
      })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(eq(subjects.id, id));

    if (!subject) return res.status(404).json({ error: "Not found" });
    res.json({ data: subject });
  } catch (e) {
    console.error("GET /subjects/:id error", e);
    res.status(500).json({ error: "Failed to fetch subject" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, code, departmentId, description } = req.body;
    if (!name || !code || !departmentId) {
      return res
        .status(400)
        .json({ error: "name, code and departmentId are required" });
    }

    const [created] = await db
      .insert(subjects)
      .values({ name, code, departmentId, description })
      .returning({ id: subjects.id });

    res.status(201).json({ data: created });
  } catch (e) {
    console.error("POST /subjects error", e);
    res.status(500).json({ error: "Failed to create subject" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return res.status(400).json({ error: "Invalid id" });

    const { name, code, departmentId, description } = req.body;
    const [updated] = await db
      .update(subjects)
      .set({ name, code, departmentId, description })
      .where(eq(subjects.id, id))
      .returning({ id: subjects.id });

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ data: updated });
  } catch (e) {
    console.error("PUT /subjects/:id error", e);
    res.status(500).json({ error: "Failed to update subject" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return res.status(400).json({ error: "Invalid id" });

    const classCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(classes)
      .where(eq(classes.subjectId, id));

    if ((classCount[0]?.count ?? 0) > 0) {
      return res
        .status(409)
        .json({ error: "Cannot delete subject with linked classes" });
    }

    const deleted = await db.delete(subjects).where(eq(subjects.id, id));

    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.status(204).send();
  } catch (e) {
    console.error("DELETE /subjects/:id error", e);
    res.status(500).json({ error: "Failed to delete subject" });
  }
});

export default router;
