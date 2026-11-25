import fs from 'node:fs';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

const candidateEnvFiles = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
];

for (const envPath of candidateEnvFiles) {
  if (fs.existsSync(envPath)) {
    loadDotenv({ path: envPath, override: false });
  }
}

export const DEFAULT_DATABASE_URL =
  'postgresql://myspotify:myspotify@localhost:5432/myspotify';

export function getDatabaseUrl(): string {
  return process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
}
