import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AnalysisModule } from '../analysis/analysis.module';
import { RedisModule } from './redis.module';
import { RedisService } from './redis.service';

describe('RedisModule', () => {
  it('exports RedisService to each module that consumes it', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, RedisModule),
    ).toContain(RedisService);
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, AnalysisModule),
    ).toContain(RedisModule);
  });
});
