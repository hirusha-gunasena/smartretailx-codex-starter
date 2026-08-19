import { createHash } from 'node:crypto';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import {
  EVENT_VERSION,
  inventoryRejectedEventSchema,
  inventoryReservedEventSchema,
} from '@smartretailx/event-contracts';
import type { InventoryRejectedEvent, InventoryReservedEvent } from '@smartretailx/event-contracts';
import type { DynamoDBRecord } from 'aws-lambda';
import {
  INVENTORY_RESERVATION_OUTCOME,
  inventoryReservationSchema,
} from '../../domain/inventory-reservation.js';
import type { InventoryReservation } from '../../domain/inventory-reservation.js';

/** RFC 4122 URL namespace, fixed to keep relay event identities stable across retries. */
export const INVENTORY_OUTCOME_EVENT_UUID_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

const UUID_NAMESPACE_HEX = INVENTORY_OUTCOME_EVENT_UUID_NAMESPACE.replaceAll('-', '');
const INVENTORY_SERVICE_EVENT_SOURCE = 'inventory-service' as const;

export const INVENTORY_OUTCOME_EVENT_TYPE = {
  RESERVED: 'InventoryReserved',
  REJECTED: 'InventoryRejected',
} as const;

export type InventoryOutcomeEventType =
  (typeof INVENTORY_OUTCOME_EVENT_TYPE)[keyof typeof INVENTORY_OUTCOME_EVENT_TYPE];
export type InventoryOutcomeEvent = InventoryReservedEvent | InventoryRejectedEvent;

export class InventoryOutcomeStreamRecordError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

const uuidV5 = (name: string): string => {
  const namespaceBytes = Buffer.from(UUID_NAMESPACE_HEX, 'hex');
  const digest = createHash('sha1').update(namespaceBytes).update(name, 'utf8').digest();

  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;

  const hexadecimal = digest.subarray(0, 16).toString('hex');
  return [
    hexadecimal.slice(0, 8),
    hexadecimal.slice(8, 12),
    hexadecimal.slice(12, 16),
    hexadecimal.slice(16, 20),
    hexadecimal.slice(20),
  ].join('-');
};

export const createInventoryOutcomeEventId = (
  eventType: InventoryOutcomeEventType,
  reservationEventId: string,
): string => uuidV5(`smartretailx:${eventType}:${reservationEventId}`);

const toInventoryReservedEvent = (
  reservation: Extract<
    InventoryReservation,
    { outcome: typeof INVENTORY_RESERVATION_OUTCOME.RESERVED }
  >,
): InventoryReservedEvent =>
  inventoryReservedEventSchema.parse({
    eventId: createInventoryOutcomeEventId(
      INVENTORY_OUTCOME_EVENT_TYPE.RESERVED,
      reservation.eventId,
    ),
    eventType: INVENTORY_OUTCOME_EVENT_TYPE.RESERVED,
    eventVersion: EVENT_VERSION,
    occurredAt: reservation.processedAt,
    source: INVENTORY_SERVICE_EVENT_SOURCE,
    correlationId: reservation.correlationId,
    data: {
      orderId: reservation.orderId,
      reservationId: reservation.eventId,
      items: reservation.items.map((item) => ({ ...item })),
    },
  });

const toInventoryRejectedEvent = (
  reservation: Extract<
    InventoryReservation,
    { outcome: typeof INVENTORY_RESERVATION_OUTCOME.REJECTED }
  >,
): InventoryRejectedEvent =>
  inventoryRejectedEventSchema.parse({
    eventId: createInventoryOutcomeEventId(
      INVENTORY_OUTCOME_EVENT_TYPE.REJECTED,
      reservation.eventId,
    ),
    eventType: INVENTORY_OUTCOME_EVENT_TYPE.REJECTED,
    eventVersion: EVENT_VERSION,
    occurredAt: reservation.processedAt,
    source: INVENTORY_SERVICE_EVENT_SOURCE,
    correlationId: reservation.correlationId,
    data: {
      orderId: reservation.orderId,
      reason: reservation.reason,
      items: reservation.insufficientItems.map((item) => ({ ...item })),
    },
  });

const toInventoryOutcomeEvent = (reservation: InventoryReservation): InventoryOutcomeEvent =>
  reservation.outcome === INVENTORY_RESERVATION_OUTCOME.RESERVED
    ? toInventoryReservedEvent(reservation)
    : toInventoryRejectedEvent(reservation);

export const mapInventoryOutcomeStreamRecord = (
  record: DynamoDBRecord,
): InventoryOutcomeEvent | null => {
  if (record.eventName === 'MODIFY' || record.eventName === 'REMOVE') {
    return null;
  }

  if (record.eventName !== 'INSERT') {
    throw new InventoryOutcomeStreamRecordError(
      'UNSUPPORTED_STREAM_EVENT',
      'The DynamoDB stream record has an unsupported or missing event name.',
    );
  }

  const newImage = record.dynamodb?.NewImage;
  if (newImage === undefined) {
    throw new InventoryOutcomeStreamRecordError(
      'MISSING_NEW_IMAGE',
      'An INSERT inventory reservation stream record must contain dynamodb.NewImage.',
    );
  }

  const reservation = inventoryReservationSchema.parse(
    unmarshall(newImage as Parameters<typeof unmarshall>[0]),
  );
  return toInventoryOutcomeEvent(reservation);
};
