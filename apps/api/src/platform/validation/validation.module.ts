import { Global, Module } from '@nestjs/common';
import { ZodValidationPipe } from './zod-validation.pipe';

@Global()
@Module({ providers: [ZodValidationPipe], exports: [ZodValidationPipe] })
export class ValidationModule {}
