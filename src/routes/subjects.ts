import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import express from "express";
import { subjects, departments } from "../db/schema";
import { db } from "../db";

const router = express.Router();

// Get all subjects with optional search, filtering ang pagination
router.get("/", async (req, res) => {
  try {
    const { search, department, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
    const limitPerPage = Math.max(
      Math.max(1, parseInt(String(limit), 10) || 10),
      100,
    ); // Limit the maximum items per page to 100

    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];

    // if search query exists, filter by subject name OR subject code
    if (search) {
      filterConditions.push(
        or(
          ilike(subjects.name, `%${search}%`),
          ilike(subjects.code, `%${search}%`),
        ),
      );
    }

    // if department query exists, match department name
    if (department) {
      const deptPattern = `%${String(department).replace(/[%_]/g, "\\$&")}%`;
      filterConditions.push(ilike(departments.name, deptPattern));
    }
    // Combine all filter using AND if any exist
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

export default router;
