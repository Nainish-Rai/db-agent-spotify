import { pgTable, serial, varchar, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";

export const liked_songs = pgTable("liked_songs", {
  id: serial("id").primaryKey(),
  id: integer("integer").primaryKey().autoincrement(),
  songId: integer("integer").notNull().references(() => songs.id),
  userId: integer("integer").notNull().references(() => users.id),
  likedAt: varchar("timestamp", { length: 255 }).defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relationships
// manyToOne: songs.songId
// manyToOne: users.userId
