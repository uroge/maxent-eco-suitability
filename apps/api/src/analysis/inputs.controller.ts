import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  CompleteAnalysisInputsRequest,
  AnalysisInputManifestResponse,
  AnalysisResponse,
  IdempotencyKey,
} from '@ecosuitability/contracts';
import {
  analysisIdSchema,
  completeAnalysisInputsRequestSchema,
  uploadDatasetIdSchema,
  idempotencyKeySchema,
} from '@ecosuitability/contracts';
import { AuthenticationGuard } from '../platform/auth/authentication.guard';
import type { AuthenticatedRequest } from '../platform/auth/authenticated-request';
import { AuthenticatedRateLimitGuard } from '../platform/rate-limit/authenticated-rate-limit.guard';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { UploadService } from './upload.service';
import { OperationIdempotencyService } from './operation-idempotency.service';

const idempotencyKeyPipe = new ZodValidationPipe(idempotencyKeySchema);

@Controller('analyses/:analysisId/inputs')
@UseGuards(AuthenticationGuard, AuthenticatedRateLimitGuard)
export class InputsController {
  public constructor(
    private readonly uploadService: UploadService,
    private readonly operations: OperationIdempotencyService,
  ) {}

  @Get()
  public async list(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
  ): Promise<AnalysisInputManifestResponse> {
    return {
      inputs: await this.uploadService.inputs(request.principal!, analysisId),
    };
  }

  @Post('complete')
  public async complete(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
    @Headers('idempotency-key') rawIdempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(completeAnalysisInputsRequestSchema))
    body: CompleteAnalysisInputsRequest,
  ): Promise<AnalysisResponse> {
    const key = idempotencyKeyPipe.transform(
      rawIdempotencyKey,
    ) as IdempotencyKey;
    return {
      analysis: await this.operations.execute(
        request.principal!,
        analysisId,
        key,
        'complete-inputs',
        body,
        () =>
          this.uploadService.completeInputs(
            request.principal!,
            analysisId,
            body.expectedInputRevision,
          ),
      ),
    };
  }

  @Delete(':datasetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async remove(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
    @Param('datasetId', new ZodValidationPipe(uploadDatasetIdSchema))
    datasetId: string,
    @Headers('idempotency-key') rawIdempotencyKey: string | undefined,
  ): Promise<void> {
    const key = idempotencyKeyPipe.transform(
      rawIdempotencyKey,
    ) as IdempotencyKey;
    await this.operations.execute(
      request.principal!,
      analysisId,
      key,
      'remove-input',
      { datasetId },
      async () => {
        await this.uploadService.removeInput(
          request.principal!,
          analysisId,
          datasetId,
        );
        return null;
      },
    );
  }
}
