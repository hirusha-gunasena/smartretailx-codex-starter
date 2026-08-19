import { createHash } from 'node:crypto';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { orderSchema } from '@smartretailx/api-contracts';
import type {
  ConfirmedOrder,
  Order,
  PendingOrder,
  RejectedOrder,
} from '@smartretailx/api-contracts';
import {
  EVENT_VERSION,
  orderConfirmedEventSchema,
  orderCreatedEventSchema,
  orderRejectedEventSchema,
} from '@smartretailx/event-contracts';
import type {
  OrderConfirmedEvent,
  OrderCreatedEvent,
  OrderRejectedEvent,
} from '@smartretailx/event-contracts';
import type { DynamoDBRecord } from 'aws-lambda';
import { ORDER_STATUS } from '../../domain/order-status.js';

const UUID_V5_URL_NAMESPACE = '6ba7b8119dad11d180b400c04fd430c8';
const ORDER_CREATED_EVENT_TYPE = 'OrderCreated' as const;
const ORDER_CONFIRMED_EVENT_TYPE = 'OrderConfirmed' as const;
const ORDER_REJECTED_EVENT_TYPE = 'OrderRejected' as const;
const ORDER_SERVICE_EVENT_SOURCE = 'order-service' as const;

export type OrderLifecycleEvent = OrderCreatedEvent | OrderConfirmedEvent | OrderRejectedEvent;

export class OrderStreamRecordError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class OrderLifecycleTransitionError extends OrderStreamRecordError {}

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

export const createOrderConfirmedEventId = (orderId: string): string =>
  uuidV5(`smartretailx:${ORDER_CONFIRMED_EVENT_TYPE}:${orderId}`);

export const createOrderRejectedEventId = (orderId: string): string =>
  uuidV5(`smartretailx:${ORDER_REJECTED_EVENT_TYPE}:${orderId}`);

const toOrderCreatedEvent = (order: PendingOrder): OrderCreatedEvent =>
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

const toOrderConfirmedEvent = (order: ConfirmedOrder): OrderConfirmedEvent =>
  orderConfirmedEventSchema.parse({
    eventId: createOrderConfirmedEventId(order.orderId),
    eventType: ORDER_CONFIRMED_EVENT_TYPE,
    eventVersion: EVENT_VERSION,
    occurredAt: order.updatedAt,
    source: ORDER_SERVICE_EVENT_SOURCE,
    correlationId: order.orderId,
    data: {
      orderId: order.orderId,
      reservationId: order.reservationId,
    },
  });

const toOrderRejectedEvent = (order: RejectedOrder): OrderRejectedEvent =>
  orderRejectedEventSchema.parse({
    eventId: createOrderRejectedEventId(order.orderId),
    eventType: ORDER_REJECTED_EVENT_TYPE,
    eventVersion: EVENT_VERSION,
    occurredAt: order.updatedAt,
    source: ORDER_SERVICE_EVENT_SOURCE,
    correlationId: order.orderId,
    data: {
      orderId: order.orderId,
      reason: order.rejectionReason,
    },
  });

const parseOrderImage = (
  image: NonNullable<NonNullable<DynamoDBRecord['dynamodb']>['NewImage']>,
): Order => orderSchema.parse(unmarshall(image as Parameters<typeof unmarshall>[0]));

const haveEqualItems = (oldOrder: Order, newOrder: Order): boolean =>
  oldOrder.items.length === newOrder.items.length &&
  oldOrder.items.every((oldItem, index) => {
    const newItem = newOrder.items[index];
    return (
      newItem !== undefined &&
      oldItem.productId === newItem.productId &&
      oldItem.quantity === newItem.quantity &&
      oldItem.unitPrice === newItem.unitPrice
    );
  });

const assertImmutableOrderData = (oldOrder: Order, newOrder: Order): void => {
  if (
    oldOrder.customerId !== newOrder.customerId ||
    !haveEqualItems(oldOrder, newOrder) ||
    oldOrder.totalAmount !== newOrder.totalAmount ||
    oldOrder.currency !== newOrder.currency ||
    oldOrder.createdAt !== newOrder.createdAt
  ) {
    throw new OrderLifecycleTransitionError(
      'IMMUTABLE_ORDER_DATA_CHANGED',
      `Order '${oldOrder.orderId}' MODIFY changed immutable business data.`,
    );
  }
};

const assertValidModifyTimestamps = (oldOrder: Order, newOrder: Order): void => {
  if (
    Date.parse(newOrder.updatedAt) < Date.parse(oldOrder.updatedAt) ||
    Date.parse(newOrder.updatedAt) < Date.parse(newOrder.createdAt)
  ) {
    throw new OrderLifecycleTransitionError(
      'INVALID_ORDER_TIMESTAMP_TRANSITION',
      `Order '${oldOrder.orderId}' MODIFY regressed its lifecycle timestamp.`,
    );
  }
};

const mapInsertedOrder = (record: DynamoDBRecord): OrderCreatedEvent => {
  const newImage = record.dynamodb?.NewImage;
  if (newImage === undefined) {
    throw new OrderStreamRecordError(
      'MISSING_NEW_IMAGE',
      'An INSERT order stream record must contain dynamodb.NewImage.',
    );
  }

  const order = parseOrderImage(newImage);
  if (order.status !== ORDER_STATUS.PENDING) {
    throw new OrderStreamRecordError(
      'INVALID_NEW_ORDER_STATUS',
      'An inserted order must have PENDING status before OrderCreated can be relayed.',
    );
  }

  return toOrderCreatedEvent(order);
};

const mapModifiedOrder = (record: DynamoDBRecord): OrderLifecycleEvent | null => {
  const oldImage = record.dynamodb?.OldImage;
  if (oldImage === undefined) {
    throw new OrderStreamRecordError(
      'MISSING_OLD_IMAGE',
      'A MODIFY order stream record must contain dynamodb.OldImage.',
    );
  }

  const newImage = record.dynamodb?.NewImage;
  if (newImage === undefined) {
    throw new OrderStreamRecordError(
      'MISSING_NEW_IMAGE',
      'A MODIFY order stream record must contain dynamodb.NewImage.',
    );
  }

  const oldOrder = parseOrderImage(oldImage);
  const newOrder = parseOrderImage(newImage);

  if (oldOrder.orderId !== newOrder.orderId) {
    throw new OrderLifecycleTransitionError(
      'ORDER_ID_MISMATCH',
      `Order stream MODIFY changed orderId from '${oldOrder.orderId}' to '${newOrder.orderId}'.`,
    );
  }

  assertImmutableOrderData(oldOrder, newOrder);
  assertValidModifyTimestamps(oldOrder, newOrder);

  if (oldOrder.status === newOrder.status) {
    if (
      oldOrder.status === 'CONFIRMED' &&
      newOrder.status === 'CONFIRMED' &&
      oldOrder.reservationId !== newOrder.reservationId
    ) {
      throw new OrderLifecycleTransitionError(
        'TERMINAL_ORDER_METADATA_CHANGED',
        `Confirmed Order '${oldOrder.orderId}' changed its durable reservationId.`,
      );
    }

    if (
      oldOrder.status === 'REJECTED' &&
      newOrder.status === 'REJECTED' &&
      oldOrder.rejectionReason !== newOrder.rejectionReason
    ) {
      throw new OrderLifecycleTransitionError(
        'TERMINAL_ORDER_METADATA_CHANGED',
        `Rejected Order '${oldOrder.orderId}' changed its durable rejectionReason.`,
      );
    }

    return null;
  }

  if (oldOrder.status === 'PENDING' && newOrder.status === 'CONFIRMED') {
    return toOrderConfirmedEvent(newOrder);
  }

  if (oldOrder.status === 'PENDING' && newOrder.status === 'REJECTED') {
    return toOrderRejectedEvent(newOrder);
  }

  throw new OrderLifecycleTransitionError(
    'INVALID_ORDER_STATUS_TRANSITION',
    `Order '${oldOrder.orderId}' cannot transition from '${oldOrder.status}' to '${newOrder.status}'.`,
  );
};

export const mapOrderStreamRecord = (record: DynamoDBRecord): OrderLifecycleEvent | null => {
  if (record.eventName === 'REMOVE') {
    return null;
  }

  if (record.eventName === 'INSERT') {
    return mapInsertedOrder(record);
  }

  if (record.eventName === 'MODIFY') {
    return mapModifiedOrder(record);
  }

  throw new OrderStreamRecordError(
    'UNSUPPORTED_STREAM_EVENT',
    'The DynamoDB stream record has an unsupported or missing event name.',
  );
};
