import {
  INVENTORY_REJECTION_REASON,
  INVENTORY_RESERVATION_OUTCOME,
  InventoryTransactionLimitError,
  MAX_DISTINCT_PRODUCTS_PER_RESERVATION,
  ProcessOrderCreated,
  inventoryItemSchema,
} from '../../src/index.js';
import type { Clock } from '../../src/index.js';
import { InMemoryInventoryReservationRepository } from '../support/in-memory-inventory-reservation-repository.js';
import {
  CORRELATION_ID,
  EVENT_ID,
  ORDER_ID,
  PROCESSED_AT,
  PRODUCT_ID,
  SECOND_PRODUCT_ID,
  orderCreatedFixture,
} from '../support/fixtures.js';

const fixedClock: Clock = { now: () => PROCESSED_AT };

const distinctProductId = (index: number): string =>
  `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`;

describe('inventory domain', () => {
  test('validates a non-negative inventory item', () => {
    expect(
      inventoryItemSchema.parse({
        productId: PRODUCT_ID,
        availableQuantity: 0,
        updatedAt: PROCESSED_AT,
      }),
    ).toEqual({ productId: PRODUCT_ID, availableQuantity: 0, updatedAt: PROCESSED_AT });
  });

  test('rejects a negative inventory quantity', () => {
    expect(() =>
      inventoryItemSchema.parse({
        productId: PRODUCT_ID,
        availableQuantity: -1,
        updatedAt: PROCESSED_AT,
      }),
    ).toThrow();
  });
});

describe('ProcessOrderCreated', () => {
  test('reserves one product', async () => {
    const repository = new InMemoryInventoryReservationRepository(new Map([[PRODUCT_ID, 10]]));
    const processor = new ProcessOrderCreated(repository, fixedClock);

    const result = await processor.execute(orderCreatedFixture());

    expect(result.reservation.outcome).toBe(INVENTORY_RESERVATION_OUTCOME.RESERVED);
    expect(repository.availableQuantity(PRODUCT_ID)).toBe(8);
  });

  test('reserves multiple products atomically', async () => {
    const repository = new InMemoryInventoryReservationRepository(
      new Map([
        [PRODUCT_ID, 10],
        [SECOND_PRODUCT_ID, 8],
      ]),
    );
    const processor = new ProcessOrderCreated(repository, fixedClock);
    const event = orderCreatedFixture({
      data: {
        ...orderCreatedFixture().data,
        items: [
          { productId: PRODUCT_ID, quantity: 2, unitPrice: 10 },
          { productId: SECOND_PRODUCT_ID, quantity: 3, unitPrice: 5 },
        ],
      },
    });

    const result = await processor.execute(event);

    expect(result.reservation.outcome).toBe(INVENTORY_RESERVATION_OUTCOME.RESERVED);
    expect(repository.availableQuantity(PRODUCT_ID)).toBe(8);
    expect(repository.availableQuantity(SECOND_PRODUCT_ID)).toBe(5);
  });

  test('aggregates duplicate product lines into one reservation item', async () => {
    const repository = new InMemoryInventoryReservationRepository(new Map([[PRODUCT_ID, 10]]));
    const processor = new ProcessOrderCreated(repository, fixedClock);
    const event = orderCreatedFixture({
      data: {
        ...orderCreatedFixture().data,
        items: [
          { productId: PRODUCT_ID, quantity: 2, unitPrice: 10 },
          { productId: PRODUCT_ID, quantity: 3, unitPrice: 10 },
        ],
      },
    });

    const result = await processor.execute(event);

    expect(result.reservation.items).toEqual([{ productId: PRODUCT_ID, quantity: 5 }]);
    expect(repository.requests[0]?.items).toHaveLength(1);
  });

  test('subtracts the aggregated total quantity', async () => {
    const repository = new InMemoryInventoryReservationRepository(new Map([[PRODUCT_ID, 10]]));
    const processor = new ProcessOrderCreated(repository, fixedClock);
    const event = orderCreatedFixture({
      data: {
        ...orderCreatedFixture().data,
        items: [
          { productId: PRODUCT_ID, quantity: 2, unitPrice: 10 },
          { productId: PRODUCT_ID, quantity: 3, unitPrice: 10 },
        ],
      },
    });

    await processor.execute(event);

    expect(repository.availableQuantity(PRODUCT_ID)).toBe(5);
  });

  test('returns the original durable outcome for an existing event', async () => {
    const repository = new InMemoryInventoryReservationRepository(new Map([[PRODUCT_ID, 10]]));
    const processor = new ProcessOrderCreated(repository, fixedClock);
    const original = await processor.execute(orderCreatedFixture());

    const duplicate = await processor.execute(orderCreatedFixture());

    expect(duplicate).toEqual({ reservation: original.reservation, idempotent: true });
    expect(duplicate.reservation.processedAt).toBe(PROCESSED_AT);
  });

  test('does not decrement inventory twice for a duplicate event', async () => {
    const repository = new InMemoryInventoryReservationRepository(new Map([[PRODUCT_ID, 10]]));
    const processor = new ProcessOrderCreated(repository, fixedClock);

    await processor.execute(orderCreatedFixture());
    await processor.execute(orderCreatedFixture());

    expect(repository.availableQuantity(PRODUCT_ID)).toBe(8);
  });

  test('returns REJECTED when an inventory item is missing', async () => {
    const repository = new InMemoryInventoryReservationRepository(new Map());
    const processor = new ProcessOrderCreated(repository, fixedClock);

    const result = await processor.execute(orderCreatedFixture());

    expect(result.reservation).toMatchObject({
      outcome: INVENTORY_RESERVATION_OUTCOME.REJECTED,
      reason: INVENTORY_REJECTION_REASON.INSUFFICIENT_STOCK,
      insufficientItems: [{ productId: PRODUCT_ID, requestedQuantity: 2, availableQuantity: 0 }],
    });
  });

  test('returns REJECTED when available quantity is insufficient', async () => {
    const repository = new InMemoryInventoryReservationRepository(new Map([[PRODUCT_ID, 1]]));
    const processor = new ProcessOrderCreated(repository, fixedClock);

    const result = await processor.execute(orderCreatedFixture());

    expect(result.reservation.outcome).toBe(INVENTORY_RESERVATION_OUTCOME.REJECTED);
    expect(repository.availableQuantity(PRODUCT_ID)).toBe(1);
  });

  test('does not partially decrement stock after rejection', async () => {
    const repository = new InMemoryInventoryReservationRepository(
      new Map([
        [PRODUCT_ID, 10],
        [SECOND_PRODUCT_ID, 1],
      ]),
    );
    const processor = new ProcessOrderCreated(repository, fixedClock);
    const event = orderCreatedFixture({
      data: {
        ...orderCreatedFixture().data,
        items: [
          { productId: PRODUCT_ID, quantity: 2, unitPrice: 10 },
          { productId: SECOND_PRODUCT_ID, quantity: 3, unitPrice: 5 },
        ],
      },
    });

    await processor.execute(event);

    expect(repository.availableQuantity(PRODUCT_ID)).toBe(10);
    expect(repository.availableQuantity(SECOND_PRODUCT_ID)).toBe(1);
  });

  test('uses one deterministic processing timestamp', async () => {
    const repository = new InMemoryInventoryReservationRepository(new Map([[PRODUCT_ID, 10]]));
    const processor = new ProcessOrderCreated(repository, fixedClock);

    const result = await processor.execute(orderCreatedFixture());

    expect(result.reservation.processedAt).toBe(PROCESSED_AT);
    expect(repository.requests[0]?.processedAt).toBe(PROCESSED_AT);
  });

  test('preserves event, order, and correlation identities', async () => {
    const repository = new InMemoryInventoryReservationRepository(new Map([[PRODUCT_ID, 10]]));
    const processor = new ProcessOrderCreated(repository, fixedClock);

    const result = await processor.execute(orderCreatedFixture());

    expect(result.reservation).toMatchObject({
      eventId: EVENT_ID,
      orderId: ORDER_ID,
      correlationId: CORRELATION_ID,
    });
  });

  test('rejects excessive distinct products before constructing a transaction', async () => {
    const itemCount = MAX_DISTINCT_PRODUCTS_PER_RESERVATION + 1;
    const items = Array.from({ length: itemCount }, (_, index) => ({
      productId: distinctProductId(index),
      quantity: 1,
      unitPrice: 1,
    }));
    const repository = new InMemoryInventoryReservationRepository(new Map());
    const processor = new ProcessOrderCreated(repository, fixedClock);
    const event = orderCreatedFixture({ data: { ...orderCreatedFixture().data, items } });

    await expect(processor.execute(event)).rejects.toBeInstanceOf(InventoryTransactionLimitError);
    expect(repository.requests).toHaveLength(0);
  });
});
