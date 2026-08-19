import { randomUUID } from 'node:crypto';
import type { Clock } from '../application/ports/clock.js';
import type { IdGenerator } from '../application/ports/id-generator.js';

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
