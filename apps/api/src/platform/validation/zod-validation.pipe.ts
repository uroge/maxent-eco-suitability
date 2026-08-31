import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

export class ZodValidationPipe<
  TSchema extends z.ZodType,
> implements PipeTransform<unknown, z.output<TSchema>> {
  public constructor(private readonly schema: TSchema) {}

  public transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);

    if (result.success) {
      return result.data;
    }

    throw new BadRequestException({
      message: result.error.issues.slice(0, 32).map((issue) => ({
        field: issue.path.join('.') || 'request',
        code: issue.code.toUpperCase(),
      })),
    });
  }
}
