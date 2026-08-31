import { Injectable } from '@nestjs/common';
import { Counter, Registry, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();

  public readonly httpRequests = new Counter({
    name: 'ecosuitability_http_requests_total',
    help: 'HTTP requests served by the API.',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [this.registry],
  });

  public constructor() {
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'ecosuitability_',
    });
  }

  public async metrics(): Promise<string> {
    return this.registry.metrics();
  }

  public contentType(): string {
    return this.registry.contentType;
  }
}
