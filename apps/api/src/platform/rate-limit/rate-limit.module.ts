import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AuthenticatedRateLimitGuard } from './authenticated-rate-limit.guard';
import { GlobalRateLimitMiddleware } from './global-rate-limit.middleware';
import { RateLimitService } from './rate-limit.service';

@Module({
  providers: [
    RateLimitService,
    GlobalRateLimitMiddleware,
    AuthenticatedRateLimitGuard,
  ],
  exports: [AuthenticatedRateLimitGuard],
})
export class RateLimitModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(GlobalRateLimitMiddleware).forRoutes('*');
  }
}
