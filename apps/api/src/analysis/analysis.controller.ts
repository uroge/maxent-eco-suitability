import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  AnalysisResponse,
  CreateAnalysisRequest,
  IdempotencyKey,
} from '@ecosuitability/contracts';
import {
  analysisIdSchema,
  createAnalysisRequestSchema,
  idempotencyKeySchema,
} from '@ecosuitability/contracts';
import type { Response } from 'express';
import { AuthenticationGuard } from '../platform/auth/authentication.guard';
import type { AuthenticatedRequest } from '../platform/auth/authenticated-request';
import { AuthenticatedRateLimitGuard } from '../platform/rate-limit/authenticated-rate-limit.guard';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { AnalysisService } from './analysis.service';

const idempotencyKeyPipe = new ZodValidationPipe(idempotencyKeySchema);

@Controller('analyses')
@UseGuards(AuthenticationGuard, AuthenticatedRateLimitGuard)
export class AnalysisController {
  public constructor(private readonly analysisService: AnalysisService) {}

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
}
