// Export your models here. Add one export per file
// export * from "./posts";
//
// Each model/table should ideally be split into different files.
// Each model/table should define a Drizzle table, insert schema, and types:
//
//   import { pgTable, text, serial } from "drizzle-orm/pg-core";
//   import { createInsertSchema } from "drizzle-zod";
//   import { z } from "zod/v4";
//
//   export const postsTable = pgTable("posts", {
//     id: serial("id").primaryKey(),
//     title: text("title").notNull(),
//   });
//
//   export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true });
//   export type InsertPost = z.infer<typeof insertPostSchema>;
//   export type Post = typeof postsTable.$inferSelect;

import {
  boolean,
  doublePrecision,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const locationUsersTable = pgTable("location_users", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  sharingEnabled: boolean("sharing_enabled").notNull().default(false),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  accuracy: doublePrecision("accuracy"),
  locationUpdatedAt: timestamp("location_updated_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const locationInvitesTable = pgTable(
  "location_invites",
  {
    code: text("code").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => locationUsersTable.userId, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("location_invites_owner_idx").on(table.ownerId)],
);

export const locationConnectionsTable = pgTable(
  "location_connections",
  {
    userA: text("user_a")
      .notNull()
      .references(() => locationUsersTable.userId, { onDelete: "cascade" }),
    userB: text("user_b")
      .notNull()
      .references(() => locationUsersTable.userId, { onDelete: "cascade" }),
    linkedAt: timestamp("linked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userA, table.userB] }),
    index("location_connections_user_a_idx").on(table.userA),
    index("location_connections_user_b_idx").on(table.userB),
  ],
);