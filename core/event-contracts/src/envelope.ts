import { z } from 'zod';

export const EVENT_VERSION = '1.0' as const;

export const eventEnvelopeSchema = z
  .object({
    eventId: z.string().uuid(),
    eventType: z.string().trim().min(1),
    eventVersion: z.literal(EVENT_VERSION),
    occurredAt: z.string().datetime({ offset: true }),
    source: z.string().trim().min(1),
    correlationId: z.string().uuid(),
    data: z.unknown(),
  })
  .strict();

export interface EventEnvelope<TEventType extends string, TData> {
  readonly eventId: string;
  readonly eventType: TEventType;
  readonly eventVersion: typeof EVENT_VERSION;
  readonly occurredAt: string;
  readonly source: string;
  readonly correlationId: string;
  readonly data: TData;
}

export const createEventEnvelopeSchema = <
  const TEventType extends string,
  const TSource extends string,
  TDataSchema extends z.ZodType,
>(
  eventType: TEventType,
  source: TSource,
  dataSchema: TDataSchema,
) =>
  eventEnvelopeSchema.extend({
    eventType: z.literal(eventType),
    source: z.literal(source),
    data: dataSchema,
  });
