import {
  inventoryRejectedEventSchema,
  inventoryReservedEventSchema,
} from '@smartretailx/event-contracts';
import type { InventoryRejectedEvent, InventoryReservedEvent } from '@smartretailx/event-contracts';
import { z } from 'zod';

export const INVENTORY_OUTCOME_EVENTBRIDGE_SOURCE = 'smartretailx.inventory-service' as const;

const eventBridgeEnvelopeFields = {
  version: z.literal('0'),
  id: z.string().trim().min(1),
  source: z.literal(INVENTORY_OUTCOME_EVENTBRIDGE_SOURCE),
  account: z.string().trim().min(1),
  time: z.string().datetime({ offset: true }),
  region: z.string().trim().min(1),
  resources: z.array(z.string()),
};

export const eventBridgeInventoryReservedEnvelopeSchema = z
  .object({
    ...eventBridgeEnvelopeFields,
    'detail-type': z.literal('InventoryReserved'),
    detail: inventoryReservedEventSchema,
  })
  .passthrough();

export const eventBridgeInventoryRejectedEnvelopeSchema = z
  .object({
    ...eventBridgeEnvelopeFields,
    'detail-type': z.literal('InventoryRejected'),
    detail: inventoryRejectedEventSchema,
  })
  .passthrough();

export const eventBridgeInventoryOutcomeEnvelopeSchema = z.discriminatedUnion('detail-type', [
  eventBridgeInventoryReservedEnvelopeSchema,
  eventBridgeInventoryRejectedEnvelopeSchema,
]);

export type InventoryOutcomeEvent = InventoryReservedEvent | InventoryRejectedEvent;

export const parseInventoryOutcomeMessage = (body: string): InventoryOutcomeEvent => {
  const decoded: unknown = JSON.parse(body);
  return eventBridgeInventoryOutcomeEnvelopeSchema.parse(decoded).detail;
};
