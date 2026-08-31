import {
  Global,
  MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { AuthenticatedRateLimitGuard } from './authenticated-rate-limit.guard';
import { AnonymousRateLimitGuard } from './anonymous-rate-limit.guard';
import { GlobalRateLimitMiddleware } from './global-rate-limit.middleware';
import { RateLimitService } from './rate-limit.service';

@Global()
@Module({
  providers: [
    RateLimitService,
    GlobalRateLimitMiddleware,
    AuthenticatedRateLimitGuard,
    AnonymousRateLimitGuard,
  ],
  exports: [AuthenticatedRateLimitGuard, AnonymousRateLimitGuard],
})
export class RateLimitModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(GlobalRateLimitMiddleware).forRoutes('*');
  }
}
