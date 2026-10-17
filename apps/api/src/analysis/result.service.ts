import { Injectable } from '@nestjs/common';
import type {
  AnalysisArtifactDownloadResponse,
  AnalysisResultManifest,
  AnalysisConfiguration,
  AnalysisDiagnosticsResponse,
  AnalysisResultOverviewResponse,
  Principal,
} from '@ecosuitability/contracts';
import {
  analysisExecutionSummaryArtifactSchema,
  analysisMetricsArtifactSchema,
  analysisResultManifestSchema,
  analysisResponseCurvesArtifactSchema,
  analysisVariableImportanceArtifactSchema,
} from '@ecosuitability/contracts';
import { ApiException } from '../platform/errors/api.exception';
import { StorageService } from '../storage/storage.service';
import { AnalysisRepository } from './analysis.repository';

const maxDownloadTtlSeconds = 5 * 60;

@Injectable()
export class ResultService {
  public constructor(
    private readonly repository: AnalysisRepository,
    private readonly storage: StorageService,
  ) {}

  public async manifest(
    principal: Principal,
    analysisId: string,
  ): Promise<AnalysisResultManifest> {
    const analysis = await this.analysis(principal, analysisId);
    return analysisResultManifestSchema.parse(analysis.resultManifest);
  }

  public async download(
    principal: Principal,
    analysisId: string,
    artifactId: string,
  ): Promise<AnalysisArtifactDownloadResponse> {
    const analysis = await this.analysis(principal, analysisId);
    const manifest = analysisResultManifestSchema.parse(
      analysis.resultManifest,
    );
    const artifact = analysis.resultManifest!.artifacts.find(
      (candidate) => candidate.id === artifactId,
    );
    if (!artifact) {
      throw this.notFound();
    }

    const remainingMs =
      new Date(manifest.resultExpiresAt).getTime() - Date.now();
    if (remainingMs <= 1_000) {
      throw this.notFound();
    }

    const expiresIn = Math.min(
      maxDownloadTtlSeconds,
      Math.floor(remainingMs / 1_000),
    );
    return {
      downloadUrl: await this.storage.presignGet(
        artifact.storageKey,
        expiresIn,
      ),
      expiresAt: new Date(Date.now() + expiresIn * 1_000).toISOString(),
    };
  }

  public async overview(
    principal: Principal,
    analysisId: string,
  ): Promise<AnalysisResultOverviewResponse['overview']> {
    const analysis = await this.analysis(principal, analysisId);
    const manifest = analysisResultManifestSchema.parse(
      analysis.resultManifest,
    );
    const [metricsValue, summaryValue] = await Promise.all([
      this.readArtifact(analysis, 'metrics'),
      this.readArtifact(analysis, 'execution-summary'),
    ]);
    const metrics = analysisMetricsArtifactSchema.parse(metricsValue);
    const summary = analysisExecutionSummaryArtifactSchema.parse(summaryValue);
    const configuration =
      analysis.executionSnapshot?.configuration ?? analysis.configuration;
    if (!configuration) {
      throw this.notFound();
    }
    return {
      analysisId: analysis.id,
      displayName: analysis.displayName,
      completedAt: manifest.completedAt,
      resultExpiresAt: manifest.resultExpiresAt,
      metrics,
      validation: summary.validation,
      configuration: configuration as AnalysisConfiguration,
    };
  }

  public async diagnostics(
    principal: Principal,
    analysisId: string,
  ): Promise<AnalysisDiagnosticsResponse['diagnostics']> {
    const analysis = await this.analysis(principal, analysisId);
    const [metrics, importance, responseCurves] = await Promise.all([
      this.readArtifact(analysis, 'metrics'),
      this.readArtifact(analysis, 'variable-importance'),
      this.readArtifact(analysis, 'response-curves'),
    ]);
    return {
      metrics: analysisMetricsArtifactSchema.parse(metrics),
      importance: analysisVariableImportanceArtifactSchema.parse(importance),
      responseCurves:
        analysisResponseCurvesArtifactSchema.parse(responseCurves),
    };
  }

  private async readArtifact(
    analysis: Awaited<ReturnType<ResultService['analysis']>>,
    kind: AnalysisResultManifest['artifacts'][number]['kind'],
  ): Promise<unknown> {
    const artifact = analysis.resultManifest?.artifacts.find(
      (item) => item.kind === kind,
    );
    if (!artifact) {
      throw this.notFound();
    }
    return this.storage.getJson(artifact.storageKey);
  }

  private async analysis(principal: Principal, analysisId: string) {
    const analysis = await this.repository.findOwned(
      analysisId,
      principal.userId,
    );
    if (analysis?.status !== 'succeeded' || !analysis.resultManifest) {
      throw this.notFound();
    }

    return analysis;
  }

  private notFound(): ApiException {
    return new ApiException(
      404,
      'NOT_FOUND',
      'The requested resource was not found.',
    );
  }
}
