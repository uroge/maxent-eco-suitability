import { Module } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';

@Module({ providers: [ApiExceptionFilter], exports: [ApiExceptionFilter] })
export class ErrorsModule {}
