import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse } from '@ecosuitability/contracts';
import { RequestContextService } from '../context/request-context.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  public constructor(
    private readonly redis: RedisService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Get('live')
  public live(): HealthResponse {
    return this.response('ok');
  }

  @Get('ready')
  public async ready(): Promise<HealthResponse> {
    if (!(await this.redis.isReady())) {
      throw new ServiceUnavailableException(
        'Required dependencies are unavailable.',
      );
    }

    return this.response('ok');
  }

  private response(status: HealthResponse['status']): HealthResponse {
    return {
      status,
      service: 'api',
      requestId: this.requestContext.get()?.requestId ?? 'unknown',
    };
  }
}
