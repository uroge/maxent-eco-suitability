import { Module } from '@nestjs/common';
import { AuthModule } from '../platform/auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { AnalysisController } from './analysis.controller';
import { AnalysisCleanupService } from './analysis-cleanup.service';
import { AnalysisExpiryService } from './analysis-expiry.service';
import { AnalysisRepository } from './analysis.repository';
import { AnalysisService } from './analysis.service';
import { DatasetRepository } from './dataset.repository';
import { UploadController } from './upload.controller';
import { UploadExpiryService } from './upload-expiry.service';
import { UploadService } from './upload.service';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [AnalysisController, UploadController],
  providers: [
    AnalysisRepository,
    AnalysisService,
    AnalysisExpiryService,
    AnalysisCleanupService,
    DatasetRepository,
    UploadService,
    UploadExpiryService,
  ],
  exports: [AnalysisService],
})
export class AnalysisModule {}
