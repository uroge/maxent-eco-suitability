import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type {
  AnalysisInputProfileResponse,
  AnalysisPreflightResponse,
} from '@ecosuitability/contracts';
import { analysisIdSchema } from '@ecosuitability/contracts';
import { AuthenticationGuard } from '../platform/auth/authentication.guard';
import type { AuthenticatedRequest } from '../platform/auth/authenticated-request';
import { AuthenticatedRateLimitGuard } from '../platform/rate-limit/authenticated-rate-limit.guard';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { ValidationService } from './validation.service';

@Controller('analyses/:analysisId')
@UseGuards(AuthenticationGuard, AuthenticatedRateLimitGuard)
export class ValidationController {
  public constructor(private readonly validation: ValidationService) {}

  @Post('input-profile')
  public async requestProfile(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
  ): Promise<AnalysisInputProfileResponse> {
    return {
      profile: await this.validation.requestProfile(
        request.principal!,
        analysisId,
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
  ): Promise<AnalysisPreflightResponse> {
    return {
      preflight: await this.validation.requestPreflight(
        request.principal!,
        analysisId,
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
