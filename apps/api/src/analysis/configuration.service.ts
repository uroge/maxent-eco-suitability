import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  AnalysisConfigurationResponse,
  IdempotencyKey,
  Principal,
  UpdateAnalysisConfigurationRequest,
} from '@ecosuitability/contracts';
import { ApiException } from '../platform/errors/api.exception';
import { AnalysisRepository } from './analysis.repository';

const featureOrder = ['linear', 'quadratic', 'product', 'hinge', 'threshold'];

@Injectable()
export class ConfigurationService {
  public constructor(private readonly repository: AnalysisRepository) {}

  public async get(
    principal: Principal,
    analysisId: string,
  ): Promise<AnalysisConfigurationResponse> {
    const analysis = await this.repository.findOwned(
      analysisId,
      principal.userId,
    );
    if (!analysis) {
      throw this.notFound();
    }
    const frozen = analysis.executionSnapshot;
    return {
      mode: frozen ? 'frozen' : 'editable',
      configuration: frozen?.configuration ?? analysis.configuration ?? null,
      revision: frozen?.revision ?? analysis.configurationRevision ?? 0,
      fingerprint: frozen?.fingerprint ?? analysis.configurationFingerprint,
    };
  }

  public async update(
    principal: Principal,
    analysisId: string,
    idempotencyKey: IdempotencyKey,
    request: UpdateAnalysisConfigurationRequest,
  ): Promise<AnalysisConfigurationResponse> {
    const configuration = this.canonical(request.configuration);
    const fingerprint = this.fingerprint(configuration);
    const result = await this.repository.updateConfiguration(
      analysisId,
      principal.userId,
      idempotencyKey,
      request.expectedRevision,
      configuration,
      fingerprint,
    );
    if (result === 'missing') {
      throw this.notFound();
    }
    if (result === 'conflict') {
      throw new ApiException(
        409,
        'CONFLICT',
        'The configuration revision changed. Reload and retry.',
      );
    }
    if (result === 'invalid') {
      throw new ApiException(
        409,
        'CONFLICT',
        'The analysis configuration is immutable.',
      );
    }
    return {
      mode: 'editable',
      configuration: result.configuration!,
      revision: result.configurationRevision!,
      fingerprint: result.configurationFingerprint,
    };
  }

  private canonical(
    configuration: UpdateAnalysisConfigurationRequest['configuration'],
  ): UpdateAnalysisConfigurationRequest['configuration'] {
    return {
      ...configuration,
      model: {
        ...configuration.model,
        featureClasses: [...configuration.model.featureClasses].sort(
          (left, right) =>
            featureOrder.indexOf(left) - featureOrder.indexOf(right),
        ),
      },
    };
  }

  private fingerprint(
    configuration: UpdateAnalysisConfigurationRequest['configuration'],
  ): string {
    const canonical = this.sort(configuration);
    return `jcs-sha256-v1:${createHash('sha256').update(JSON.stringify(canonical)).digest('hex')}`;
  }

  private sort(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry) => this.sort(entry));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, this.sort(entry)]),
      );
    }
    return Object.is(value, -0) ? 0 : value;
  }

  private notFound(): ApiException {
    return new ApiException(
      404,
      'NOT_FOUND',
      'The requested resource was not found.',
    );
  }
}
