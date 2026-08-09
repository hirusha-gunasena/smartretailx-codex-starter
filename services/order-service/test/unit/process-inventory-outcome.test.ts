import { jest } from '@jest/globals';
import {
  ORDER_WORKFLOW_TRANSITION_RESULT,
  OrderWorkflowValidationError,
  ProcessInventoryOutcome,
} from '../../src/index.js';
import type {
  OrderWorkflowRepository,
  OrderWorkflowTransition,
  OrderWorkflowTransitionResult,
} from '../../src/index.js';
import { ORDER_ID, SECOND_ORDER_ID } from '../support/fixtures.js';
import {
  OUTCOME_OCCURRED_AT,
  inventoryRejectedFixture,
  inventoryReservedFixture,
} from '../support/inventory-outcome-fixtures.js';

describe('ProcessInventoryOutcome', () => {
  let transitionFromPending =
    jest.fn<(transition: OrderWorkflowTransition) => Promise<OrderWorkflowTransitionResult>>();
  let repository: OrderWorkflowRepository;
  let processor: ProcessInventoryOutcome;

  beforeEach(() => {
    transitionFromPending =
      jest.fn<(transition: OrderWorkflowTransition) => Promise<OrderWorkflowTransitionResult>>();
    repository = { transitionFromPending };
    processor = new ProcessInventoryOutcome(repository);
  });

  test('maps InventoryReserved to CONFIRMED and calls the repository once', async () => {
    transitionFromPending.mockResolvedValue(ORDER_WORKFLOW_TRANSITION_RESULT.UPDATED);

    await processor.execute(inventoryReservedFixture());

    expect(transitionFromPending).toHaveBeenCalledTimes(1);
    expect(transitionFromPending).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      targetStatus: 'CONFIRMED',
      updatedAt: OUTCOME_OCCURRED_AT,
    });
  });

  test('maps InventoryRejected to REJECTED and calls the repository once', async () => {
    transitionFromPending.mockResolvedValue(ORDER_WORKFLOW_TRANSITION_RESULT.UPDATED);

    await processor.execute(inventoryRejectedFixture());

    expect(transitionFromPending).toHaveBeenCalledTimes(1);
    expect(transitionFromPending).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      targetStatus: 'REJECTED',
      updatedAt: OUTCOME_OCCURRED_AT,
    });
  });

  test('uses canonical occurredAt instead of retry processing time', async () => {
    transitionFromPending.mockResolvedValue(ORDER_WORKFLOW_TRANSITION_RESULT.UPDATED);

    await processor.execute(inventoryReservedFixture({ occurredAt: '2026-08-09T14:15:00+05:30' }));

    expect(transitionFromPending).toHaveBeenCalledWith(
      expect.objectContaining({ updatedAt: '2026-08-09T08:45:00.000Z' }),
    );
  });

  test('uses data.orderId as the persistence identity', async () => {
    transitionFromPending.mockResolvedValue(ORDER_WORKFLOW_TRANSITION_RESULT.UPDATED);

    await processor.execute(
      inventoryReservedFixture({
        correlationId: SECOND_ORDER_ID,
        data: { ...inventoryReservedFixture().data, orderId: SECOND_ORDER_ID },
      }),
    );

    expect(transitionFromPending).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: SECOND_ORDER_ID }),
    );
  });

  test('returns UPDATED', async () => {
    transitionFromPending.mockResolvedValue(ORDER_WORKFLOW_TRANSITION_RESULT.UPDATED);

    await expect(processor.execute(inventoryReservedFixture())).resolves.toBe(
      ORDER_WORKFLOW_TRANSITION_RESULT.UPDATED,
    );
  });

  test('returns ALREADY_APPLIED for a successful duplicate', async () => {
    transitionFromPending.mockResolvedValue(ORDER_WORKFLOW_TRANSITION_RESULT.ALREADY_APPLIED);

    await expect(processor.execute(inventoryRejectedFixture())).resolves.toBe(
      ORDER_WORKFLOW_TRANSITION_RESULT.ALREADY_APPLIED,
    );
  });

  test('rejects a correlationId that differs from orderId', async () => {
    const event = inventoryReservedFixture({ correlationId: SECOND_ORDER_ID });

    await expect(processor.execute(event)).rejects.toBeInstanceOf(OrderWorkflowValidationError);
    expect(transitionFromPending).not.toHaveBeenCalled();
  });

  test('propagates repository exceptions unchanged', async () => {
    const failure = new Error('DynamoDB unavailable');
    transitionFromPending.mockRejectedValue(failure);

    await expect(processor.execute(inventoryReservedFixture())).rejects.toBe(failure);
  });
});
