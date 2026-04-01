import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import express from "express";
import { user } from "../db/schema/index.js";
import { db } from "../db/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { search, role, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, Number(page));
    const limitPerPage = Math.max(1, Number(limit));
    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];

    if (search) {
      filterConditions.push(
        or(
          ilike(user.name, `%${String(search)}%`),
          ilike(user.email, `%${String(search)}%`),
        ),
      );
    }

    if (role) {
      filterConditions.push(eq(user.role, String(role)));
    }

    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(user)
      .where(whereClause);

    const totalCount = countResult[0]?.count ?? 0;

    const usersList = await db
      .select()
      .from(user)
      .where(whereClause)
      .orderBy(desc(user.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: usersList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (error) {
    console.error("GET /users error:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const usersList = await db
      .select()
      .from(user)
      .where(eq(user.id, id))
      .limit(1);

    if (!usersList.length) return res.status(404).json({ error: "Not found" });
    res.json({ data: usersList[0] });
  } catch (error) {
    console.error("GET /users/:id error", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { id, email, name, role, image, imageCldPubId, emailVerified } =
      req.body;
    if (!email || !name || !role) {
      return res.status(400).json({ error: "email, name, role required" });
    }

    const userId = id || email;

    const [created] = await db
      .insert(user)
      .values({
        id: userId,
        email,
        name,
        role,
        image,
        imageCldPubId,
        emailVerified: emailVerified ?? false,
      })
      .returning({ id: user.id });

    res.status(201).json({ data: created });
  } catch (error) {
    console.error("POST /users error", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const { email, name, role, image, imageCldPubId, emailVerified } = req.body;

    const [updated] = await db
      .update(user)
      .set({ email, name, role, image, imageCldPubId, emailVerified })
      .where(eq(user.id, id))
      .returning({ id: user.id });

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ data: updated });
  } catch (error) {
    console.error("PUT /users/:id error", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const deleted = await db.delete(user).where(eq(user.id, id));
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.status(204).send();
  } catch (error) {
    console.error("DELETE /users/:id error", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

export default router;
