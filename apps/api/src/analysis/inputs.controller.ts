import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  AnalysisInputManifestResponse,
  AnalysisResponse,
} from '@ecosuitability/contracts';
import {
  analysisIdSchema,
  uploadDatasetIdSchema,
} from '@ecosuitability/contracts';
import { AuthenticationGuard } from '../platform/auth/authentication.guard';
import type { AuthenticatedRequest } from '../platform/auth/authenticated-request';
import { AuthenticatedRateLimitGuard } from '../platform/rate-limit/authenticated-rate-limit.guard';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { UploadService } from './upload.service';

@Controller('analyses/:analysisId/inputs')
@UseGuards(AuthenticationGuard, AuthenticatedRateLimitGuard)
export class InputsController {
  public constructor(private readonly uploadService: UploadService) {}

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
  ): Promise<AnalysisResponse> {
    return {
      analysis: await this.uploadService.completeInputs(
        request.principal!,
        analysisId,
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
  ): Promise<void> {
    await this.uploadService.removeInput(
      request.principal!,
      analysisId,
      datasetId,
    );
  }
}
