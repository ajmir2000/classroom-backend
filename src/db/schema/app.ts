import { relations } from "drizzle-orm";
import {
  integer,
  jsonb,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/*
|--------------------------------------------------------------------------
| Schedule Type
|--------------------------------------------------------------------------
|
| Defines the structure of each schedule object stored in the JSON column.
| Example value stored in database:
|
| [
|   { day: "Monday", start: "09:00", end: "10:30" }
| ]
|
*/

export type Schedule = {
  day: string;
  start: string;
  end: string;
};

/*
|--------------------------------------------------------------------------
| Shared Timestamp Columns
|--------------------------------------------------------------------------
|
| These fields are reused in multiple tables.
| created_at → when the record was created
| updated_at → when the record was last updated
|
| $onUpdate automatically updates the updated_at column
| whenever the row changes.
|
*/

const timestamps = {
  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

/*
|--------------------------------------------------------------------------
| Class Status Enum
|--------------------------------------------------------------------------
|
| Defines the allowed status values for a class.
| Using ENUM ensures only these values can be stored.
|
*/

export const classStatusEnum = pgEnum("class_status", [
  "active",
  "inactive",
  "archived",
]);

/*
|--------------------------------------------------------------------------
| Departments Table
|--------------------------------------------------------------------------
|
| Stores academic departments such as:
| Computer Science, Electronics, Mathematics, etc.
|
*/

export const departments = pgTable("departments", {
  /*
  | Auto-increment primary key
  */

  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

  /*
  | Unique department code (e.g., CS, EE)
  */

  code: varchar("code", { length: 50 }).notNull().unique(),

  /*
  | Department name
  */

  name: varchar("name", { length: 255 }).notNull(),

  /*
  | Optional description
  */

  description: text("description"),

  ...timestamps,
});

/*
|--------------------------------------------------------------------------
| Subjects Table
|--------------------------------------------------------------------------
|
| Each subject belongs to a department.
| Example:
| Department: Computer Science
| Subject: Data Structures
|
*/

export const subjects = pgTable("subjects", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

  /*
  | Foreign key → departments table
  | restrict means a department cannot be deleted
  | if subjects still reference it.
  */

  departmentId: integer("department_id")
    .notNull()
    .references(() => departments.id, { onDelete: "restrict" }),

  /*
  | Subject name
  */

  name: varchar("name", { length: 255 }).notNull(),

  /*
  | Unique subject code (e.g., CS101)
  */

  code: varchar("code", { length: 50 }).notNull().unique(),

  /*
  | Optional description
  */

  description: text("description"),

  ...timestamps,
});

/*
|--------------------------------------------------------------------------
| Classes Table
|--------------------------------------------------------------------------
|
| Represents a specific class created by a teacher.
| Example:
| Subject: Data Structures
| Class: Data Structures - Spring 2026
|
*/

export const classes = pgTable(
  "classes",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

    /*
    | Foreign key → subject
    | cascade means if the subject is deleted,
    | the related classes will also be deleted.
    */

    subjectId: integer("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),

    /*
    | Teacher creating the class
    | references user table from auth schema
    */

    teacherId: text("teacher_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),

    /*
    | Unique code used by students to join the class
    */

    inviteCode: varchar("invite_code", { length: 50 }).notNull().unique(),

    /*
    | Class name
    */

    name: varchar("name", { length: 255 }).notNull(),

    /*
    | Cloudinary public id for banner image
    */

    bannerCldPubId: text("banner_cld_pub_id"),

    /*
    | Banner image URL
    */

    bannerUrl: text("banner_url"),

    /*
    | Maximum number of students allowed
    */

    capacity: integer("capacity").notNull().default(50),

    /*
    | Optional class description
    */

    description: text("description"),

    /*
    | Current class status
    */

    status: classStatusEnum("status").notNull().default("active"),

    /*
    | Class schedules stored as JSON
    | Example:
    | [{ day: "Monday", start: "09:00", end: "10:30" }]
    */

    schedules: jsonb("schedules").$type<Schedule[]>().notNull(),

    ...timestamps,
  },

  /*
  |--------------------------------------------------------------------------
  | Indexes
  |--------------------------------------------------------------------------
  |
  | Improve query performance when filtering by subject or teacher.
  |
  */

  (table) => ({
    subjectIdIdx: index("classes_subject_id_idx").on(table.subjectId),
    teacherIdIdx: index("classes_teacher_id_idx").on(table.teacherId),
  }),
);

/*
|--------------------------------------------------------------------------
| Enrollments Table
|--------------------------------------------------------------------------
|
| Connects students to classes.
| Each record means a student joined a class.
|
*/

export const enrollments = pgTable(
  "enrollments",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

    /*
    | Student reference
    */

    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    /*
    | Class reference
    */

    classId: integer("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),

    ...timestamps,
  },

  (table) => ({
    /*
    | Index for faster student queries
    */

    studentIdIdx: index("enrollments_student_id_idx").on(table.studentId),

    /*
    | Index for faster class queries
    */

    classIdIdx: index("enrollments_class_id_idx").on(table.classId),

    /*
    | Prevent duplicate enrollment
    | (same student joining the same class twice)
    */

    studentClassUnique: index("enrollments_student_class_unique").on(
      table.studentId,
      table.classId,
    ),
  }),
);

/*
|--------------------------------------------------------------------------
| Table Relations
|--------------------------------------------------------------------------
|
| These describe how tables are connected.
|
*/

/*
| Department → many subjects
*/

export const departmentsRelations = relations(departments, ({ many }) => ({
  subjects: many(subjects),
}));

/*
| Subject → belongs to one department
| Subject → has many classes
*/

export const subjectsRelations = relations(subjects, ({ one, many }) => ({
  department: one(departments, {
    fields: [subjects.departmentId],
    references: [departments.id],
  }),
  classes: many(classes),
}));

/*
| Class → belongs to one subject
| Class → belongs to one teacher
| Class → has many enrollments
*/

export const classesRelations = relations(classes, ({ one, many }) => ({
  subject: one(subjects, {
    fields: [classes.subjectId],
    references: [subjects.id],
  }),
  teacher: one(user, {
    fields: [classes.teacherId],
    references: [user.id],
  }),
  enrollments: many(enrollments),
}));

/*
| Enrollment → belongs to one student
| Enrollment → belongs to one class
*/

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  student: one(user, {
    fields: [enrollments.studentId],
    references: [user.id],
  }),
  class: one(classes, {
    fields: [enrollments.classId],
    references: [classes.id],
  }),
}));

/*
|--------------------------------------------------------------------------
| TypeScript Types
|--------------------------------------------------------------------------
|
| $inferSelect → type returned when selecting data
| $inferInsert → type required when inserting new rows
|
*/

export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;

export type Subject = typeof subjects.$inferSelect;
export type NewSubject = typeof subjects.$inferInsert;

export type Class = typeof classes.$inferSelect;
export type NewClass = typeof classes.$inferInsert;

export type Enrollment = typeof enrollments.$inferSelect;
export type NewEnrollment = typeof enrollments.$inferInsert;
