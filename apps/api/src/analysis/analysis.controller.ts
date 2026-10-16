import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  AnalysisResponse,
  AnalysisArtifactDownloadResponse,
  AnalysisResultManifestResponse,
  CreateAnalysisRequest,
  AnalysisConfigurationResponse,
  UpdateAnalysisConfigurationRequest,
  IdempotencyKey,
} from '@ecosuitability/contracts';
import {
  analysisIdSchema,
  analysisArtifactIdSchema,
  createAnalysisRequestSchema,
  idempotencyKeySchema,
  updateAnalysisConfigurationRequestSchema,
} from '@ecosuitability/contracts';
import type { Response } from 'express';
import { AuthenticationGuard } from '../platform/auth/authentication.guard';
import type { AuthenticatedRequest } from '../platform/auth/authenticated-request';
import { AuthenticatedRateLimitGuard } from '../platform/rate-limit/authenticated-rate-limit.guard';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { AnalysisService } from './analysis.service';
import { ResultService } from './result.service';
import { ConfigurationService } from './configuration.service';

const idempotencyKeyPipe = new ZodValidationPipe(idempotencyKeySchema);

@Controller('analyses')
@UseGuards(AuthenticationGuard, AuthenticatedRateLimitGuard)
export class AnalysisController {
  public constructor(
    private readonly analysisService: AnalysisService,
    private readonly resultService: ResultService,
    private readonly configurationService: ConfigurationService,
  ) {}

  @Post()
  public async create(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') rawIdempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(createAnalysisRequestSchema))
    body: CreateAnalysisRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AnalysisResponse> {
    const idempotencyKey = idempotencyKeyPipe.transform(
      rawIdempotencyKey,
    ) as IdempotencyKey;
    const result = await this.analysisService.create(
      request.principal!,
      idempotencyKey,
      body,
    );
    response.status(result.replayed ? HttpStatus.OK : HttpStatus.CREATED);
    return { analysis: result.analysis };
  }

  @Get(':analysisId')
  public async find(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
  ): Promise<AnalysisResponse> {
    return {
      analysis: await this.analysisService.find(request.principal!, analysisId),
    };
  }

  @Get(':analysisId/results')
  public async results(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
  ): Promise<AnalysisResultManifestResponse> {
    return {
      result: await this.resultService.manifest(request.principal!, analysisId),
    };
  }

  @Get(':analysisId/configuration')
  public async configuration(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
  ): Promise<AnalysisConfigurationResponse> {
    return this.configurationService.get(request.principal!, analysisId);
  }

  @Put(':analysisId/configuration')
  public async updateConfiguration(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
    @Headers('idempotency-key') rawIdempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(updateAnalysisConfigurationRequestSchema))
    body: UpdateAnalysisConfigurationRequest,
  ): Promise<AnalysisConfigurationResponse> {
    const idempotencyKey = idempotencyKeyPipe.transform(
      rawIdempotencyKey,
    ) as IdempotencyKey;
    return this.configurationService.update(
      request.principal!,
      analysisId,
      idempotencyKey,
      body,
    );
  }

  @Post(':analysisId/results/:artifactId/download')
  public async download(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
    @Param('artifactId', new ZodValidationPipe(analysisArtifactIdSchema))
    artifactId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AnalysisArtifactDownloadResponse> {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    return this.resultService.download(
      request.principal!,
      analysisId,
      artifactId,
    );
  }

  @Post(':analysisId/cancel')
  @HttpCode(HttpStatus.OK)
  public async cancel(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
  ): Promise<AnalysisResponse> {
    return {
      analysis: await this.analysisService.cancel(
        request.principal!,
        analysisId,
      ),
    };
  }

  @Post(':analysisId/queue')
  @HttpCode(HttpStatus.OK)
  public async queue(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
  ): Promise<AnalysisResponse> {
    return {
      analysis: await this.analysisService.queueAnalysis(
        request.principal!,
        analysisId,
      ),
    };
  }
}
