import { createHash } from 'node:crypto';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { orderSchema } from '@smartretailx/api-contracts';
import type { Order } from '@smartretailx/api-contracts';
import { EVENT_VERSION, orderCreatedEventSchema } from '@smartretailx/event-contracts';
import type { OrderCreatedEvent } from '@smartretailx/event-contracts';
import type { DynamoDBRecord } from 'aws-lambda';
import { ORDER_STATUS } from '../../domain/order-status.js';

const UUID_V5_URL_NAMESPACE = '6ba7b8119dad11d180b400c04fd430c8';
const ORDER_CREATED_EVENT_TYPE = 'OrderCreated' as const;
const ORDER_SERVICE_EVENT_SOURCE = 'order-service' as const;

export class OrderStreamRecordError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

const uuidV5 = (name: string): string => {
  const namespaceBytes = Buffer.from(UUID_V5_URL_NAMESPACE, 'hex');
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

export const createOrderCreatedEventId = (orderId: string): string =>
  uuidV5(`smartretailx:${ORDER_CREATED_EVENT_TYPE}:${orderId}`);

const toOrderCreatedEvent = (order: Order): OrderCreatedEvent =>
  orderCreatedEventSchema.parse({
    eventId: createOrderCreatedEventId(order.orderId),
    eventType: ORDER_CREATED_EVENT_TYPE,
    eventVersion: EVENT_VERSION,
    occurredAt: order.createdAt,
    source: ORDER_SERVICE_EVENT_SOURCE,
    correlationId: order.orderId,
    data: {
      orderId: order.orderId,
      customerId: order.customerId,
      items: order.items.map((item) => ({ ...item })),
      totalAmount: order.totalAmount,
      currency: order.currency,
    },
  });

export const mapOrderStreamRecord = (record: DynamoDBRecord): OrderCreatedEvent | null => {
  if (record.eventName === 'MODIFY' || record.eventName === 'REMOVE') {
    return null;
  }

  if (record.eventName !== 'INSERT') {
    throw new OrderStreamRecordError(
      'UNSUPPORTED_STREAM_EVENT',
      'The DynamoDB stream record has an unsupported or missing event name.',
    );
  }

  const newImage = record.dynamodb?.NewImage;
  if (newImage === undefined) {
    throw new OrderStreamRecordError(
      'MISSING_NEW_IMAGE',
      'An INSERT order stream record must contain dynamodb.NewImage.',
    );
  }

  const order = orderSchema.parse(unmarshall(newImage as Parameters<typeof unmarshall>[0]));
  if (order.status !== ORDER_STATUS.PENDING) {
    throw new OrderStreamRecordError(
      'INVALID_NEW_ORDER_STATUS',
      'An inserted order must have PENDING status before OrderCreated can be relayed.',
    );
  }

  return toOrderCreatedEvent(order);
};
