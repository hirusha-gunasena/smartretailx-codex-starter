import { randomUUID } from 'node:crypto';
import { InMemoryOrderRepository } from '../adapters/persistence/in-memory-order-repository.js';
import type { Clock } from '../application/ports/clock.js';
import type { IdGenerator } from '../application/ports/id-generator.js';
import type { OrderAppDependencies } from './create-app.js';

export class SystemClock implements Clock {
  public now(): string {
    return new Date().toISOString();
  }
}

export class RandomUuidGenerator implements IdGenerator {
  public generate(): string {
    return randomUUID();
  }
}

export type InMemoryOrderDependencies = Pick<
  OrderAppDependencies,
  'clock' | 'idGenerator' | 'repository'
>;

export const createInMemoryDependencies = (): InMemoryOrderDependencies => ({
  repository: new InMemoryOrderRepository(),
  idGenerator: new RandomUuidGenerator(),
  clock: new SystemClock(),
});

/** @deprecated Retained for compatibility; this alias always selects in-memory persistence. */
export const createSystemDependencies = createInMemoryDependencies;
