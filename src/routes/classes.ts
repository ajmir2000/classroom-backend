import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import express from "express";

import { db } from "../db/index.js";
import { classes, subjects, user } from "../db/schema/index.js";

const router = express.Router();

// Get all classes with optional search, filtering and pagination
router.get("/", async (req, res) => {
  try {
    const { search, subject, teacher, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
    const limitPerPage = Math.max(
      Math.max(1, parseInt(String(limit), 10) || 10),
      100,
    ); // Limit the maximum items per page to 100

    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];

    // if search query exists, filter by class name OR invite code
    if (search) {
      filterConditions.push(
        or(
          ilike(classes.name, `%${search}%`),
          ilike(classes.inviteCode, `%${search}%`),
        ),
      );
    }

    // if subject query exists, match subject name
    if (subject) {
      const subjectPattern = `%${String(subject).replace(/[%_]/g, "\\$&")}%`;
      filterConditions.push(ilike(subjects.name, subjectPattern));
    }

    // if teacher query exists, match teacher name
    if (teacher) {
      const teacherPattern = `%${String(teacher).replace(/[%_]/g, "\\$&")}%`;
      filterConditions.push(ilike(user.name, teacherPattern));
    }

    // Combine all filter using AND if any exist
    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(classes)
      .leftJoin(subjects, eq(classes.subjectId, subjects.id))
      .leftJoin(user, eq(classes.teacherId, user.id))
      .where(whereClause);

    const totalCount = countResult[0]?.count ?? 0;

    const classesList = await db
      .select({
        ...getTableColumns(classes),
        subject: { ...getTableColumns(subjects) },
        teacher: { id: user.id, name: user.name },
      })
      .from(classes)
      .leftJoin(subjects, eq(classes.subjectId, subjects.id))
      .leftJoin(user, eq(classes.teacherId, user.id))
      .where(whereClause)
      .orderBy(desc(classes.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.json({
      data: classesList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (e) {
    console.error("Error fetching classes:", e);
    res.status(500).json({ error: "Failed to get classes" });
  }
});

//POST Classes
router.post("/", async (req, res) => {
  try {
    const {
      name,
      teacherId,
      subjectId,
      capacity,
      description,
      status,
      bannerUrl,
      bannerCldPubId,
    } = req.body;

    const [createdClass] = await db
      .insert(classes)
      .values({
        subjectId,
        inviteCode: Math.random().toString(36).substring(2, 9),
        name,
        teacherId,
        bannerCldPubId,
        bannerUrl,
        capacity,
        description,
        schedules: [],
        status,
      })
      .returning({ id: classes.id });

    if (!createdClass) throw Error;

    res.status(201).json({ data: createdClass });
  } catch (e) {
    console.error("POST /classes error:", e);
    res.status(500).json({ error: "Failed to create class" });
  }
});

export default router;
