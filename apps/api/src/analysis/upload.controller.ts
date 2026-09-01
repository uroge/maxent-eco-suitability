import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type {
  CompleteUploadRequest,
  CreateUploadDatasetRequest,
  CreateUploadFileRequest,
  IdempotencyKey,
  UploadDatasetResponse,
  UploadFileResponse,
  UploadPartRequest,
} from '@ecosuitability/contracts';
import {
  analysisIdSchema,
  completeUploadRequestSchema,
  createUploadDatasetRequestSchema,
  createUploadFileRequestSchema,
  idempotencyKeySchema,
  uploadDatasetIdSchema,
  uploadIdSchema,
  uploadPartRequestSchema,
} from '@ecosuitability/contracts';
import type { Response } from 'express';
import { AuthenticationGuard } from '../platform/auth/authentication.guard';
import type { AuthenticatedRequest } from '../platform/auth/authenticated-request';
import { AuthenticatedRateLimitGuard } from '../platform/rate-limit/authenticated-rate-limit.guard';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { UploadService } from './upload.service';

const idempotencyKeyPipe = new ZodValidationPipe(idempotencyKeySchema);

@Controller('analyses/:analysisId/upload-datasets')
@UseGuards(AuthenticationGuard, AuthenticatedRateLimitGuard)
export class UploadController {
  public constructor(private readonly uploadService: UploadService) {}

  @Post()
  public async create(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
    @Headers('idempotency-key') rawIdempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createUploadDatasetRequestSchema))
    body: CreateUploadDatasetRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UploadDatasetResponse> {
    const result = await this.uploadService.createDataset(
      request.principal!,
      analysisId,
      idempotencyKeyPipe.transform(rawIdempotencyKey) as IdempotencyKey,
      body,
    );
    response.status(result.replayed ? HttpStatus.OK : HttpStatus.CREATED);
    return { dataset: result.dataset };
  }

  @Post(':datasetId/files')
  public async addFile(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
    @Param('datasetId', new ZodValidationPipe(uploadDatasetIdSchema))
    datasetId: string,
    @Body(new ZodValidationPipe(createUploadFileRequestSchema))
    body: CreateUploadFileRequest,
  ): Promise<{ file: UploadFileResponse }> {
    return {
      file: await this.uploadService.addFile(
        request.principal!,
        analysisId,
        datasetId,
        body,
      ),
    };
  }

  @Post(':datasetId/files/:uploadId/parts')
  public async parts(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
    @Param('datasetId', new ZodValidationPipe(uploadDatasetIdSchema))
    datasetId: string,
    @Param('uploadId', new ZodValidationPipe(uploadIdSchema)) uploadId: string,
    @Body(new ZodValidationPipe(uploadPartRequestSchema))
    body: UploadPartRequest,
  ): Promise<{ parts: Array<{ partNumber: number; url: string }> }> {
    return {
      parts: await this.uploadService.parts(
        request.principal!,
        analysisId,
        datasetId,
        uploadId,
        body.partNumbers,
      ),
    };
  }

  @Post(':datasetId/files/:uploadId/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async completeFile(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
    @Param('datasetId', new ZodValidationPipe(uploadDatasetIdSchema))
    datasetId: string,
    @Param('uploadId', new ZodValidationPipe(uploadIdSchema)) uploadId: string,
    @Body(new ZodValidationPipe(completeUploadRequestSchema))
    body: CompleteUploadRequest,
  ): Promise<void> {
    await this.uploadService.completeFile(
      request.principal!,
      analysisId,
      datasetId,
      uploadId,
      body,
    );
  }

  @Post(':datasetId/files/:uploadId/url')
  public async refreshUploadUrl(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
    @Param('datasetId', new ZodValidationPipe(uploadDatasetIdSchema))
    datasetId: string,
    @Param('uploadId', new ZodValidationPipe(uploadIdSchema)) uploadId: string,
  ): Promise<{ uploadUrl: string }> {
    return {
      uploadUrl: await this.uploadService.refreshUploadUrl(
        request.principal!,
        analysisId,
        datasetId,
        uploadId,
      ),
    };
  }

  @Post(':datasetId/complete')
  public async completeDataset(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
    @Param('datasetId', new ZodValidationPipe(uploadDatasetIdSchema))
    datasetId: string,
  ): Promise<UploadDatasetResponse> {
    return {
      dataset: await this.uploadService.completeDataset(
        request.principal!,
        analysisId,
        datasetId,
      ),
    };
  }

  @Delete(':datasetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async abortDataset(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
    @Param('datasetId', new ZodValidationPipe(uploadDatasetIdSchema))
    datasetId: string,
  ): Promise<void> {
    await this.uploadService.abortDataset(
      request.principal!,
      analysisId,
      datasetId,
    );
  }
}
