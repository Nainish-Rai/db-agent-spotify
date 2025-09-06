import {
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  boolean,
  integer,
} from "drizzle-orm/pg-core";

// Base schema for Spotify-like features
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  spotifyId: varchar("spotify_id", { length: 255 }).unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const playlists = pgTable("playlists", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),
  isPublic: boolean("is_public").default(false).notNull(),
  coverImageUrl: varchar("cover_image_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const songs = pgTable("songs", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  artist: varchar("artist", { length: 255 }).notNull(),
  album: varchar("album", { length: 255 }),
  duration: integer("duration"), // in seconds
  spotifyId: varchar("spotify_id", { length: 255 }).unique(),
  previewUrl: varchar("preview_url", { length: 500 }),
  imageUrl: varchar("image_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const playlistSongs = pgTable("playlist_songs", {
  id: serial("id").primaryKey(),
  playlistId: integer("playlist_id")
    .references(() => playlists.id)
    .notNull(),
  songId: integer("song_id")
    .references(() => songs.id)
    .notNull(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
  addedBy: integer("added_by")
    .references(() => users.id)
    .notNull(),
});

export const recentlyPlayed = pgTable("recently_played", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),
  songId: integer("song_id")
    .references(() => songs.id)
    .notNull(),
  playedAt: timestamp("played_at").defaultNow().notNull(),
});

export const userLikes = pgTable("user_likes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),
  songId: integer("song_id")
    .references(() => songs.id)
    .notNull(),
  likedAt: timestamp("liked_at").defaultNow().notNull(),
});

// Export types for TypeScript
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Playlist = typeof playlists.$inferSelect;
export type NewPlaylist = typeof playlists.$inferInsert;
export type Song = typeof songs.$inferSelect;
export type NewSong = typeof songs.$inferInsert;
export type PlaylistSong = typeof playlistSongs.$inferSelect;
export type NewPlaylistSong = typeof playlistSongs.$inferInsert;
export type RecentlyPlayed = typeof recentlyPlayed.$inferSelect;
export type NewRecentlyPlayed = typeof recentlyPlayed.$inferInsert;
export type UserLike = typeof userLikes.$inferSelect;
export type NewUserLike = typeof userLikes.$inferInsert;

export * from "./schemas/user_playlists";
export * from "./schemas/recently_played";
export * from "./schemas/album_categories";