import { Test, type TestingModule } from '@nestjs/testing';
import { ServiceStatus } from '@my-spotify/shared-types';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseService } from './database/database.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const mockDatabaseService = {
      checkHealth: async () => ({
        name: 'postgres',
        status: ServiceStatus.OK,
        latencyMs: 2,
      }),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return an OK health check response with postgres check and registered modules', async () => {
      const response = await appController.getHealth();

      expect(response.status).toBe(ServiceStatus.OK);
      expect(response.service).toBe('my-spotify-api');
      expect(response.modules).toEqual([
        'auth',
        'catalog',
        'streaming',
        'playlist',
        'history',
      ]);
      expect(response.checks).toEqual([
        { name: 'api', status: ServiceStatus.OK, latencyMs: 0 },
        { name: 'postgres', status: ServiceStatus.OK, latencyMs: 2 },
      ]);
    });
  });
});
