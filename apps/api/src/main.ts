import 'reflect-metadata';
import './database/env.js';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');

  const rawCors = process.env.CORS_ORIGIN?.trim();
  const corsOrigin =
    rawCors === '*'
      ? true
      : rawCors
        ? rawCors.split(',').map((origin) => origin.trim())
        : true;

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  logger.log(`my-spotify API listening on http://localhost:${port}/api`);
}

await bootstrap();
