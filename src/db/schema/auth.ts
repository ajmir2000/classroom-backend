import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/*
|--------------------------------------------------------------------------
| Shared Timestamp Columns
|--------------------------------------------------------------------------
|
| This object defines reusable timestamp columns.
| By spreading (...timestamps) into a table definition,
| each table automatically gets these two columns.
|
| created_at  → stores when the record was created
| updated_at  → stores when the record was last updated
|
| $onUpdate ensures that whenever a row is updated,
| updated_at automatically receives the current date.
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
| Role Enum
|--------------------------------------------------------------------------
|
| Defines a PostgreSQL ENUM type named "role".
| The column using this enum can only store one of these values:
|
| student
| teacher
| admin
|
| This helps enforce role consistency at the database level.
|
*/

export const roleEnum = pgEnum("role", ["student", "teacher", "admin"]);

/*
|--------------------------------------------------------------------------
| User Table
|--------------------------------------------------------------------------
|
| This table stores application users.
| Better Auth expects the user table with a text primary key.
|
*/

export const user = pgTable("user", {
  /*
  | Primary Key
  | Better Auth requires the user id to be a text type.
  */

  id: text("id").primaryKey(),

  /*
  | User's display name
  */

  name: text("name").notNull(),

  /*
  | User email address
  */

  email: text("email").notNull(),

  /*
  | Indicates whether the user's email has been verified
  */

  emailVerified: boolean("email_verified").notNull(),

  /*
  | URL of the user's profile image
  */

  image: text("image"),

  /*
  | Role of the user in the system
  | Default role is "student"
  */

  role: roleEnum("role").notNull().default("student"),

  /*
  | Cloudinary public ID of the image
  | Used when deleting or updating images stored in Cloudinary
  | Nullable because not every user has an uploaded image
  */

  imageCldPubId: text("image_cld_pub_id"),

  /*
  | created_at and updated_at timestamps
  */

  ...timestamps,
});

/*
|--------------------------------------------------------------------------
| Session Table
|--------------------------------------------------------------------------
|
| Stores authentication sessions.
| Each time a user logs in, a new session record may be created.
|
*/

export const session = pgTable(
  "session",
  {
    /*
    | Unique session identifier
    */

    id: text("id").primaryKey(),

    /*
    | Foreign key referencing the user who owns this session
    */

    userId: text("user_id")
      .notNull()
      .references(() => user.id),

    /*
    | Session authentication token
    */

    token: text("token").notNull(),

    /*
    | Expiration time of the session
    */

    expiresAt: timestamp("expires_at").notNull(),

    /*
    | IP address from which the user logged in
    */

    ipAddress: text("ip_address"),

    /*
    | Browser / device information
    */

    userAgent: text("user_agent"),

    ...timestamps,
  },

  /*
  |--------------------------------------------------------------------------
  | Indexes
  |--------------------------------------------------------------------------
  |
  | index() improves query performance.
  | uniqueIndex() ensures that values cannot be duplicated.
  |
  */

  (table) => ({
    userIdIdx: index("session_user_id_idx").on(table.userId),

    tokenUnique: uniqueIndex("session_token_unique").on(table.token),
  }),
);

/*
|--------------------------------------------------------------------------
| Account Table
|--------------------------------------------------------------------------
|
| Stores authentication provider accounts.
| Used for OAuth providers such as:
|
| Google
| GitHub
| Credentials login
|
*/

export const account = pgTable(
  "account",
  {
    /*
    | Primary key for the account record
    */

    id: text("id").primaryKey(),

    /*
    | Foreign key referencing the owning user
    */

    userId: text("user_id")
      .notNull()
      .references(() => user.id),

    /*
    | Unique account identifier from the provider
    */

    accountId: text("account_id").notNull(),

    /*
    | Provider name (e.g., google, github)
    */

    providerId: text("provider_id").notNull(),

    /*
    | OAuth access token
    */

    accessToken: text("access_token"),

    /*
    | OAuth refresh token
    */

    refreshToken: text("refresh_token"),

    /*
    | Expiration timestamps for tokens
    */

    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),

    /*
    | OAuth scopes
    */

    scope: text("scope"),

    /*
    | OpenID token
    */

    idToken: text("id_token"),

    /*
    | Used when authentication is done via email/password
    */

    password: text("password"),

    ...timestamps,
  },

  (table) => ({
    /*
    | Index for faster lookup by user
    */

    userIdIdx: index("account_user_id_idx").on(table.userId),

    /*
    | Prevent duplicate provider accounts
    */

    accountUnique: uniqueIndex("account_provider_account_unique").on(
      table.providerId,
      table.accountId,
    ),
  }),
);

/*
|--------------------------------------------------------------------------
| Verification Table
|--------------------------------------------------------------------------
|
| Stores temporary verification records used for:
|
| email verification
| password reset
| magic login links
|
*/

export const verification = pgTable(
  "verification",
  {
    /*
    | Primary key
    */

    id: text("id").primaryKey(),

    /*
    | Identifier usually represents the user's email
    */

    identifier: text("identifier").notNull(),

    /*
    | Verification token value
    */

    value: text("value").notNull(),

    /*
    | Expiration time for the verification token
    */

    expiresAt: timestamp("expires_at").notNull(),

    ...timestamps,
  },

  (table) => ({
    /*
    | Index to speed up lookups by identifier
    */

    identifierIdx: index("verification_identifier_idx").on(table.identifier),
  }),
);

/*
|--------------------------------------------------------------------------
| Relations
|--------------------------------------------------------------------------
|
| Drizzle relations describe how tables are connected.
|
*/

/*
| A user can have multiple sessions and multiple accounts.
*/

export const usersRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

/*
| A session belongs to exactly one user.
*/

export const sessionsRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

/*
| An account belongs to exactly one user.
*/

export const accountsRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

/*
|--------------------------------------------------------------------------
| TypeScript Types
|--------------------------------------------------------------------------
|
| These types allow TypeScript to infer the structure of each table.
|
| $inferSelect → type returned when selecting data from the table
| $inferInsert → type required when inserting new rows
|
*/

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;

export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;

export type Verification = typeof verification.$inferSelect;
export type NewVerification = typeof verification.$inferInsert;
