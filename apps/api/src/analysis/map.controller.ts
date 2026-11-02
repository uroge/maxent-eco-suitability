import {
  Controller,
  Get,
  Headers,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type {
  MapCapabilitiesResponse,
  MapInspectionResponse,
} from '@ecosuitability/contracts';
import { analysisIdSchema, mapLayerIdSchema } from '@ecosuitability/contracts';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthenticationGuard } from '../platform/auth/authentication.guard';
import type { AuthenticatedRequest } from '../platform/auth/authenticated-request';
import { AuthenticatedRateLimitGuard } from '../platform/rate-limit/authenticated-rate-limit.guard';
import { MapRateLimitGuard } from '../platform/rate-limit/map-rate-limit.guard';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import { MapService } from './map.service';

const tileCoordinateSchema = z.coerce.number().int().min(0).max(4_194_303);

const longitudeSchema = z.coerce.number().min(-180).max(180);

const latitudeSchema = z.coerce.number().min(-90).max(90);

@Controller('analyses/:analysisId/map')
@UseGuards(AuthenticationGuard, AuthenticatedRateLimitGuard, MapRateLimitGuard)
export class MapController {
  public constructor(private readonly maps: MapService) {}

  @Get('capabilities')
  public async capabilities(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
  ): Promise<MapCapabilitiesResponse> {
    return {
      capabilities: await this.maps.capabilities(
        request.principal!,
        analysisId,
      ),
    };
  }

  @Get('tiles/:layerId/:z/:x/:y')
  public async tile(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
    @Param('layerId', new ZodValidationPipe(mapLayerIdSchema)) layerId: string,
    @Param('z', new ZodValidationPipe(tileCoordinateSchema)) z: number,
    @Param('x', new ZodValidationPipe(tileCoordinateSchema)) x: number,
    @Param('y', new ZodValidationPipe(tileCoordinateSchema)) y: number,
    @Headers('x-request-id') requestId: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const tile = await this.maps.tile(
      request.principal!,
      analysisId,
      layerId,
      z,
      x,
      y,
      requestId,
    );
    response.setHeader('Content-Type', tile.contentType);
    response.setHeader('Cache-Control', 'private, max-age=300');
    response.send(Buffer.from(tile.body));
  }

  @Get('vectors/:layerId')
  public async vector(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
    @Param('layerId', new ZodValidationPipe(mapLayerIdSchema)) layerId: string,
    @Res() response: Response,
  ): Promise<void> {
    const body = await this.maps.vector(
      request.principal!,
      analysisId,
      layerId,
    );
    response.setHeader('Content-Type', 'application/geo+json');
    response.setHeader('Cache-Control', 'private, max-age=300');
    response.send(Buffer.from(body));
  }

  @Get('terrain/:z/:x/:y')
  public async terrain(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
    @Param('z', new ZodValidationPipe(tileCoordinateSchema)) z: number,
    @Param('x', new ZodValidationPipe(tileCoordinateSchema)) x: number,
    @Param('y', new ZodValidationPipe(tileCoordinateSchema)) y: number,
    @Headers('x-request-id') requestId: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const tile = await this.maps.terrain(
      request.principal!,
      analysisId,
      z,
      x,
      y,
      requestId,
    );
    response.setHeader('Content-Type', tile.contentType);
    response.setHeader('Cache-Control', 'private, max-age=300');
    response.send(Buffer.from(tile.body));
  }

  @Get('inspect')
  public async inspect(
    @Req() request: AuthenticatedRequest,
    @Param('analysisId', new ZodValidationPipe(analysisIdSchema))
    analysisId: string,
    @Query('longitude', new ZodValidationPipe(longitudeSchema))
    longitude: number,
    @Query('latitude', new ZodValidationPipe(latitudeSchema)) latitude: number,
    @Headers('x-request-id') requestId: string | undefined,
  ): Promise<MapInspectionResponse> {
    return {
      inspection: await this.maps.inspect(
        request.principal!,
        analysisId,
        longitude,
        latitude,
        requestId,
      ),
    };
  }
}
