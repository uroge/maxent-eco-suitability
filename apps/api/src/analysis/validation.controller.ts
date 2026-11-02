import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  AnalysisInputProfileResponse,
  AnalysisPreflightResponse,
  IdempotencyKey,
  RequestInputProfile,
  RequestPreflight,
} from '@ecosuitability/contracts';
import {
  analysisIdSchema,
  idempotencyKeySchema,
  requestInputProfileSchema,
  requestPreflightSchema,
} from '@ecosuitability/contracts';
import { AuthenticationGuard } from '../platform/auth/authentication.guard';
import type { AuthenticatedRequest } from '../platform/auth/authenticated-request';
import { AuthenticatedRateLimitGuard } from '../platform/rate-limit/authenticated-rate-limit.guard';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ValidationService } from './validation.service';
import { OperationIdempotencyService } from './operation-idempotency.service';

const idempotencyKeyPipe = new ZodValidationPipe(idempotencyKeySchema);

@Controller('analyses/:analysisId')
@UseGuards(AuthenticationGuard, AuthenticatedRateLimitGuard)
export class ValidationController {
  public constructor(
    private readonly validation: ValidationService,
    private readonly operations: OperationIdempotencyService,
  ) {}

  @Post('input-profile')
  public async requestProfile(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
    @Headers('idempotency-key') rawIdempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(requestInputProfileSchema))
    body: RequestInputProfile,
  ): Promise<AnalysisInputProfileResponse> {
    const key = idempotencyKeyPipe.transform(
      rawIdempotencyKey,
    ) as IdempotencyKey;
    return {
      profile: await this.operations.execute(
        request.principal!,
        analysisId,
        key,
        'input-profile',
        body,
        () =>
          this.validation.requestProfile(request.principal!, analysisId, body),
      ),
    };
  }

  @Get('input-profile')
  public async profile(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
  ): Promise<AnalysisInputProfileResponse> {
    return {
      profile: await this.validation.profile(request.principal!, analysisId),
    };
  }

  @Post('preflight')
  public async requestPreflight(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
    @Headers('idempotency-key') rawIdempotencyKey: string | undefined,
    @Body(new ZodValidationPipe(requestPreflightSchema)) body: RequestPreflight,
  ): Promise<AnalysisPreflightResponse> {
    const key = idempotencyKeyPipe.transform(
      rawIdempotencyKey,
    ) as IdempotencyKey;
    return {
      preflight: await this.operations.execute(
        request.principal!,
        analysisId,
        key,
        'preflight',
        body,
        () =>
          this.validation.requestPreflight(
            request.principal!,
            analysisId,
            body,
          ),
      ),
    };
  }

  @Get('preflight')
  public async preflight(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
  ): Promise<AnalysisPreflightResponse> {
    return {
      preflight: await this.validation.preflight(
        request.principal!,
        analysisId,
      ),
    };
  }
}
