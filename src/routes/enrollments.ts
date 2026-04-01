import express from "express";
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { classes, enrollments, user } from "../db/schema/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { classId, studentId, page = 1, limit = 20 } = req.query;
    const currentPage = Math.max(1, Number(page));
    const limitPerPage = Math.max(1, Number(limit));
    const offset = (currentPage - 1) * limitPerPage;

    const whereConditions = [];
    if (classId) whereConditions.push(eq(enrollments.classId, Number(classId)));
    if (studentId)
      whereConditions.push(eq(enrollments.studentId, String(studentId)));
    const whereClause = whereConditions.length
      ? and(...whereConditions)
      : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(enrollments)
      .where(whereClause);

    const total = countResult[0]?.count ?? 0;

    const data = await db
      .select({
        ...getTableColumns(enrollments),
        student: { ...getTableColumns(user) },
        class: { ...getTableColumns(classes) },
      })
      .from(enrollments)
      .leftJoin(user, eq(enrollments.studentId, user.id))
      .leftJoin(classes, eq(enrollments.classId, classes.id))
      .where(whereClause)
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
    console.error("GET /enrollments error", error);
    res.status(500).json({ error: "Failed to fetch enrollments" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { classId, studentId } = req.body;

    if (!classId || !studentId) {
      return res
        .status(400)
        .json({ error: "classId and studentId are required" });
    }

    const classRow = await db
      .select()
      .from(classes)
      .where(eq(classes.id, Number(classId)))
      .limit(1);
    if (!classRow.length)
      return res.status(404).json({ error: "Class not found" });
    const classInfo = classRow[0]!;

    const existing = await db
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.classId, Number(classId)),
          eq(enrollments.studentId, String(studentId)),
        ),
      )
      .limit(1);

    if (existing.length)
      return res.status(409).json({ error: "Student already enrolled" });

    const enrolledCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(enrollments)
      .where(eq(enrollments.classId, Number(classId)));

    if ((enrolledCount[0]?.count ?? 0) >= classInfo.capacity) {
      return res.status(409).json({ error: "Class is full" });
    }

    const [created] = await db
      .insert(enrollments)
      .values({ classId: Number(classId), studentId: String(studentId) })
      .returning({ id: enrollments.id });

    res.status(201).json({ data: created });
  } catch (error) {
    console.error("POST /enrollments error", error);
    res.status(500).json({ error: "Failed to enroll user" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return res.status(400).json({ error: "Invalid id" });

    const deleted = await db.delete(enrollments).where(eq(enrollments.id, id));
    if (!deleted) return res.status(404).json({ error: "Not found" });

    res.status(204).send();
  } catch (error) {
    console.error("DELETE /enrollments/:id error", error);
    res.status(500).json({ error: "Failed to unenroll" });
  }
});

export default router;
