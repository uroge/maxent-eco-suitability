import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestContext } from '@ecosuitability/contracts';

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  public run(context: RequestContext, callback: () => void): void {
    this.storage.run(context, callback);
  }

  public get(): RequestContext | undefined {
    return this.storage.getStore();
  }
}
