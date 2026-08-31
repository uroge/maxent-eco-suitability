import { Module } from '@nestjs/common';
import { AuthModule } from '../platform/auth/auth.module';
import { AnalysisController } from './analysis.controller';
import { AnalysisExpiryService } from './analysis-expiry.service';
import { AnalysisRepository } from './analysis.repository';
import { AnalysisService } from './analysis.service';

@Module({
  imports: [AuthModule],
  controllers: [AnalysisController],
  providers: [AnalysisRepository, AnalysisService, AnalysisExpiryService],
  exports: [AnalysisService],
})
export class AnalysisModule {}
