import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthGuard } from './modules/auth/auth.guard.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { HistoryModule } from './modules/history/history.module.js';
import { PlaylistModule } from './modules/playlist/playlist.module.js';
import { StreamingModule } from './modules/streaming/streaming.module.js';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    CatalogModule,
    StreamingModule,
    PlaylistModule,
    HistoryModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
