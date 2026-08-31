import { Module } from '@nestjs/common';
import { AuthModule } from '../platform/auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { AnalysisController } from './analysis.controller';
import { AnalysisExpiryService } from './analysis-expiry.service';
import { AnalysisRepository } from './analysis.repository';
import { AnalysisService } from './analysis.service';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [AnalysisController, UploadController],
  providers: [
    AnalysisRepository,
    AnalysisService,
    AnalysisExpiryService,
    UploadService,
  ],
  exports: [AnalysisService],
})
export class AnalysisModule {}
