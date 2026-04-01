import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import express from "express";

import { db } from "../db/index.js";
import {
  classes,
  departments,
  subjects,
  user,
  enrollments,
} from "../db/schema/index.js";

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

// Get class details with teacher, subject, department and enrollment count
router.get("/:id", async (req, res) => {
  const classId = Number(req.params.id);

  if (!Number.isFinite(classId))
    return res.status(400).json({ error: "No Class found." });

  const [classDetails] = await db
    .select({
      ...getTableColumns(classes),
      subject: {
        ...getTableColumns(subjects),
      },
      department: {
        ...getTableColumns(departments),
      },
      teacher: {
        ...getTableColumns(user),
      },
    })
    .from(classes)
    .leftJoin(subjects, eq(classes.subjectId, subjects.id))
    .leftJoin(user, eq(classes.teacherId, user.id))
    .leftJoin(departments, eq(subjects.departmentId, departments.id))
    .where(eq(classes.id, classId));

  if (!classDetails) return res.status(404).json({ error: "No Class found." });

  const counts = await db
    .select({ enrolled: sql<number>`count(*)` })
    .from(enrollments)
    .where(eq(enrollments.classId, classId));

  return res.status(200).json({
    data: {
      ...classDetails,
      enrolledCount: counts[0]?.enrolled ?? 0,
      remainingSeats: Math.max(
        0,
        classDetails.capacity - (counts[0]?.enrolled ?? 0),
      ),
    },
  });
});

router.put("/:id", async (req, res) => {
  const classId = Number(req.params.id);

  if (!Number.isFinite(classId))
    return res.status(400).json({ error: "Invalid class id." });

  const {
    name,
    teacherId,
    subjectId,
    capacity,
    description,
    status,
    bannerUrl,
    bannerCldPubId,
    schedules,
  } = req.body;

  try {
    const [updatedClass] = await db
      .update(classes)
      .set({
        name,
        teacherId,
        subjectId,
        capacity,
        description,
        status,
        bannerUrl,
        bannerCldPubId,
        schedules,
      })
      .where(eq(classes.id, classId))
      .returning({ id: classes.id });

    if (!updatedClass)
      return res.status(404).json({ error: "No Class found." });

    res.status(200).json({ data: updatedClass });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update class" });
  }
});

router.delete("/:id", async (req, res) => {
  const classId = Number(req.params.id);

  if (!Number.isFinite(classId))
    return res.status(400).json({ error: "Invalid class id." });

  try {
    const enrollmentCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(enrollments)
      .where(eq(enrollments.classId, classId));

    if ((enrollmentCount[0]?.count ?? 0) > 0) {
      return res.status(409).json({
        error: "Cannot delete class with enrolled students",
      });
    }

    const deleted = await db.delete(classes).where(eq(classes.id, classId));

    if (!deleted) return res.status(404).json({ error: "No Class found." });

    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete class" });
  }
});

//POST Classesx
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
