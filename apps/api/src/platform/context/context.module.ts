import { Global, Module } from '@nestjs/common';
import { RequestContextService } from './request-context.service';
import { RequestIdMiddleware } from './request-id.middleware';

@Global()
@Module({
  providers: [RequestContextService, RequestIdMiddleware],
  exports: [RequestContextService],
})
export class ContextModule {}
