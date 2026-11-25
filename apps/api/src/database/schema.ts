import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const libraryFolders = pgTable('library_folders', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull().unique(),
  isWatching: boolean('is_watching').notNull().default(true),
  lastScannedAt: timestamp('last_scanned_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tracks = pgTable(
  'tracks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    libraryFolderId: uuid('library_folder_id')
      .notNull()
      .references(() => libraryFolders.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull().unique(),
    fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull(),
    fileMtimeMs: bigint('file_mtime_ms', { mode: 'number' }).notNull(),
    title: text('title').notNull(),
    artist: text('artist').notNull(),
    album: text('album').notNull(),
    trackNumber: integer('track_number'),
    year: integer('year'),
    genre: text('genre'),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    bitrateKbps: integer('bitrate_kbps'),
    sampleRateHz: integer('sample_rate_hz'),
    codec: text('codec'),
    quality: text('quality').notNull().default('standard'),
    mimeType: text('mime_type').notNull(),
    hasCover: boolean('has_cover').notNull().default(false),
    isLiked: boolean('is_liked').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('tracks_library_folder_id_idx').on(table.libraryFolderId),
    index('tracks_artist_idx').on(table.artist),
    index('tracks_album_idx').on(table.album),
  ],
);

export type LibraryFolderRecord = typeof libraryFolders.$inferSelect;
export type TrackRecord = typeof tracks.$inferSelect;
