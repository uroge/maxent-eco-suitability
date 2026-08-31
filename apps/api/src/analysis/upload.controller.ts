import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  CompleteUploadRequest,
  CreateUploadDatasetRequest,
  UploadPartRequest,
} from '@ecosuitability/contracts';
import {
  analysisIdSchema,
  completeUploadRequestSchema,
  createUploadDatasetRequestSchema,
  uploadPartRequestSchema,
  uploadIdSchema,
} from '@ecosuitability/contracts';
import { AuthenticationGuard } from '../platform/auth/authentication.guard';
import type { AuthenticatedRequest } from '../platform/auth/authenticated-request';
import { AuthenticatedRateLimitGuard } from '../platform/rate-limit/authenticated-rate-limit.guard';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { UploadService } from './upload.service';

@Controller('analyses/:analysisId/upload-datasets')
@UseGuards(AuthenticationGuard, AuthenticatedRateLimitGuard)
export class UploadController {
  public constructor(private readonly uploadService: UploadService) {}

  @Post()
  public async create(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
    @Body(new ZodValidationPipe(createUploadDatasetRequestSchema))
    body: CreateUploadDatasetRequest,
  ): Promise<{
    datasetId: string;
    files: Array<{ uploadId: string; url: string; multipart: boolean }>;
  }> {
    return this.uploadService.createDataset(
      request.principal!,
      analysisId,
      body,
    );
  }

  @Post(':uploadId/parts')
  public async parts(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
    @Param('uploadId', new ZodValidationPipe(uploadIdSchema)) uploadId: string,
    @Body(new ZodValidationPipe(uploadPartRequestSchema))
    body: UploadPartRequest,
  ): Promise<{ parts: Array<{ partNumber: number; url: string }> }> {
    return {
      parts: await this.uploadService.parts(
        request.principal!,
        analysisId,
        uploadId,
        body.partNumbers,
      ),
    };
  }

  @Post(':uploadId/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async complete(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
    @Param('uploadId', new ZodValidationPipe(uploadIdSchema)) uploadId: string,
    @Body(new ZodValidationPipe(completeUploadRequestSchema))
    body: CompleteUploadRequest,
  ): Promise<void> {
    await this.uploadService.complete(
      request.principal!,
      analysisId,
      uploadId,
      body,
    );
  }

  @Delete(':uploadId')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async abort(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
    @Param('uploadId', new ZodValidationPipe(uploadIdSchema)) uploadId: string,
  ): Promise<void> {
    await this.uploadService.abort(request.principal!, analysisId, uploadId);
  }
}
