import { Test, type TestingModule } from '@nestjs/testing';
import { ServiceStatus } from '@my-spotify/shared-types';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return an OK health check response with registered modules', () => {
      const response = appController.getHealth();

      expect(response.status).toBe(ServiceStatus.OK);
      expect(response.service).toBe('my-spotify-api');
      expect(response.modules).toEqual([
        'auth',
        'catalog',
        'streaming',
        'playlist',
        'history',
      ]);
      expect(typeof response.uptimeSeconds).toBe('number');
    });
  });
});
