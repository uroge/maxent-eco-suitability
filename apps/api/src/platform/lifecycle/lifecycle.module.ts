import {
  Global,
  MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { LifecycleMiddleware } from './lifecycle.middleware';
import { LifecycleService } from './lifecycle.service';

@Global()
@Module({
  providers: [LifecycleService, LifecycleMiddleware],
  exports: [LifecycleService],
})
export class LifecycleModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LifecycleMiddleware).forRoutes('*');
  }
}
