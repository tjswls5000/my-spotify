import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ServiceStatus, type ServiceHealthDetail } from '@my-spotify/shared-types';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getDatabaseUrl } from './env.js';
import * as schema from './schema.js';

export type AppDatabase = NodePgDatabase<typeof schema>;

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  public readonly pool: Pool;
  public readonly db: AppDatabase;
  private ready = false;

  constructor() {
    this.pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 3_000,
    });
    this.db = drizzle(this.pool, { schema });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureSchema();
      this.ready = true;
      this.logger.log('PostgreSQL connected and schema verified');
    } catch (error) {
      this.ready = false;
      this.logger.warn(
        `PostgreSQL not reachable on startup (${error instanceof Error ? error.message : String(error)}). Run "pnpm db:up" to start PostgreSQL.`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  isReady(): boolean {
    return this.ready;
  }

  async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS library_folders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        path text NOT NULL UNIQUE,
        is_watching boolean NOT NULL DEFAULT true,
        last_scanned_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS tracks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        library_folder_id uuid NOT NULL REFERENCES library_folders(id) ON DELETE CASCADE,
        file_path text NOT NULL UNIQUE,
        file_size_bytes bigint NOT NULL,
        file_mtime_ms bigint NOT NULL,
        title text NOT NULL,
        artist text NOT NULL,
        album text NOT NULL,
        track_number integer,
        year integer,
        genre text,
        duration_seconds integer NOT NULL DEFAULT 0,
        bitrate_kbps integer,
        sample_rate_hz integer,
        codec text,
        quality text NOT NULL DEFAULT 'standard',
        mime_type text NOT NULL,
        has_cover boolean NOT NULL DEFAULT false,
        is_liked boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS tracks_library_folder_id_idx ON tracks (library_folder_id);
      CREATE INDEX IF NOT EXISTS tracks_artist_idx ON tracks (artist);
      CREATE INDEX IF NOT EXISTS tracks_album_idx ON tracks (album);
    `);
  }

  async checkHealth(): Promise<ServiceHealthDetail> {
    const startedAt = performance.now();
    try {
      await this.pool.query('SELECT 1');
      if (!this.ready) {
        await this.ensureSchema();
        this.ready = true;
      }
      return {
        name: 'postgres',
        status: ServiceStatus.OK,
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      };
    } catch {
      this.ready = false;
      return {
        name: 'postgres',
        status: ServiceStatus.DOWN,
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      };
    }
  }
}
