import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { canonicalizeJson } from '@ecosuitability/runtime-utils';
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
    const analysis = await this.repository.findOwned(
      analysisId,
      principal.userId,
    );
    if (!analysis) {
      throw this.notFound();
    }
    if (analysis.status !== 'ready') {
      throw new ApiException(
        409,
        'CONFLICT',
        'The analysis configuration is immutable.',
      );
    }
    await this.validateInputs(analysisId, configuration);
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
    return `jcs-sha256-v1:${createHash('sha256')
      .update(canonicalizeJson(configuration))
      .digest('hex')}`;
  }

  private async validateInputs(
    analysisId: string,
    configuration: UpdateAnalysisConfigurationRequest['configuration'],
  ): Promise<void> {
    const manifest = await this.repository.inputManifest(analysisId);
    const occurrence = manifest.datasets.find(
      (entry) => entry.dataset.kind === 'occurrence',
    );
    const predictors = new Map(
      manifest.datasets
        .filter(
          (entry) =>
            entry.dataset.kind === 'predictor' &&
            entry.dataset.format === 'geotiff',
        )
        .map((entry) => [entry.dataset.id, entry]),
    );

    if (
      !occurrence ||
      occurrence.dataset.format !== configuration.occurrence.format ||
      configuration.predictors.some(
        (predictor) => !predictors.has(predictor.datasetId),
      )
    ) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'The configuration does not match the attached inputs.',
      );
    }
  }

  private notFound(): ApiException {
    return new ApiException(
      404,
      'NOT_FOUND',
      'The requested resource was not found.',
    );
  }
}
