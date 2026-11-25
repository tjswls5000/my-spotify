import { defineConfig } from 'drizzle-kit';
import './src/database/env.js';

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://myspotify:myspotify@localhost:5432/myspotify',
  },
});
