import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.js';
import { CatalogScannerService } from './catalog-scanner.service.js';
import { CatalogService } from './catalog.service.js';

@Module({
  controllers: [CatalogController],
  providers: [CatalogScannerService, CatalogService],
  exports: [CatalogService, CatalogScannerService],
})
export class CatalogModule {}
