import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
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

export const playlists = pgTable('playlists', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  coverUrl: text('cover_url'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const playlistTracks = pgTable(
  'playlist_tracks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    playlistId: uuid('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    trackId: uuid('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    addedAt: timestamp('added_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('playlist_tracks_playlist_id_track_id_uidx').on(
      table.playlistId,
      table.trackId,
    ),
    index('playlist_tracks_playlist_id_position_idx').on(
      table.playlistId,
      table.position,
    ),
  ],
);

export const playbackHistory = pgTable(
  'playback_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    trackId: uuid('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    playedAt: timestamp('played_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    durationListenedSeconds: integer('duration_listened_seconds')
      .notNull()
      .default(0),
    completed: boolean('completed').notNull().default(false),
  },
  (table) => [index('playback_history_played_at_idx').on(table.playedAt)],
);

export const playbackStates = pgTable('playback_states', {
  id: text('id').primaryKey().default('default'),
  currentTrackId: uuid('current_track_id').references(() => tracks.id, {
    onDelete: 'set null',
  }),
  positionSeconds: integer('position_seconds').notNull().default(0),
  volume: doublePrecision('volume').notNull().default(0.8),
  isShuffled: boolean('is_shuffled').notNull().default(false),
  repeatMode: text('repeat_mode').notNull().default('all'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type LibraryFolderRecord = typeof libraryFolders.$inferSelect;
export type TrackRecord = typeof tracks.$inferSelect;
export type PlaylistRecord = typeof playlists.$inferSelect;
export type PlaylistTrackRecord = typeof playlistTracks.$inferSelect;
export type PlaybackHistoryRecord = typeof playbackHistory.$inferSelect;
export type PlaybackStateRecord = typeof playbackStates.$inferSelect;
export type UserRecord = typeof users.$inferSelect;
