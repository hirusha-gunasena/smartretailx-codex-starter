import { jest } from '@jest/globals';
import {
  ORDER_WORKFLOW_TRANSITION_RESULT,
  OrderNotFoundError,
  OrderWorkflowConflictError,
  createOrderWorkflowSqsHandler,
} from '../../src/index.js';
import type {
  InventoryOutcomeEvent,
  InventoryOutcomeProcessor,
  OrderWorkflowTransitionResult,
} from '../../src/index.js';
import { ORDER_ID } from '../support/fixtures.js';
import {
  inventoryOutcomeEnvelopeFixture,
  inventoryOutcomeMessageBodyFixture,
  inventoryRejectedFixture,
  inventoryReservedFixture,
  orderWorkflowSqsEventFixture,
  orderWorkflowSqsRecordFixture,
} from '../support/inventory-outcome-fixtures.js';

describe('createOrderWorkflowSqsHandler', () => {
  let execute = jest.fn<(event: InventoryOutcomeEvent) => Promise<OrderWorkflowTransitionResult>>();
  let processor: InventoryOutcomeProcessor;

  beforeEach(() => {
    execute = jest.fn<(event: InventoryOutcomeEvent) => Promise<OrderWorkflowTransitionResult>>();
    processor = { execute };
  });

  test('returns no failures for an empty batch', async () => {
    const handler = createOrderWorkflowSqsHandler(processor);

    await expect(handler(orderWorkflowSqsEventFixture([]))).resolves.toEqual({
      batchItemFailures: [],
    });
    expect(execute).not.toHaveBeenCalled();
  });

  test('successfully processes InventoryReserved', async () => {
    execute.mockResolvedValue(ORDER_WORKFLOW_TRANSITION_RESULT.UPDATED);
    const handler = createOrderWorkflowSqsHandler(processor);

    await expect(
      handler(orderWorkflowSqsEventFixture([orderWorkflowSqsRecordFixture('reserved-message')])),
    ).resolves.toEqual({ batchItemFailures: [] });
    expect(execute).toHaveBeenCalledWith(inventoryReservedFixture());
  });

  test('successfully processes InventoryRejected', async () => {
    const event = inventoryRejectedFixture();
    execute.mockResolvedValue(ORDER_WORKFLOW_TRANSITION_RESULT.UPDATED);
    const handler = createOrderWorkflowSqsHandler(processor);

    await expect(
      handler(
        orderWorkflowSqsEventFixture([
          orderWorkflowSqsRecordFixture(
            'rejected-message',
            inventoryOutcomeMessageBodyFixture(event),
          ),
        ]),
      ),
    ).resolves.toEqual({ batchItemFailures: [] });
    expect(execute).toHaveBeenCalledWith(event);
  });

  test('treats ALREADY_APPLIED duplicate processing as success', async () => {
    execute.mockResolvedValue(ORDER_WORKFLOW_TRANSITION_RESULT.ALREADY_APPLIED);
    const handler = createOrderWorkflowSqsHandler(processor);

    await expect(
      handler(orderWorkflowSqsEventFixture([orderWorkflowSqsRecordFixture('duplicate-message')])),
    ).resolves.toEqual({ batchItemFailures: [] });
  });

  test('processes multiple successful messages', async () => {
    execute.mockResolvedValue(ORDER_WORKFLOW_TRANSITION_RESULT.UPDATED);
    const handler = createOrderWorkflowSqsHandler(processor);

    await expect(
      handler(
        orderWorkflowSqsEventFixture([
          orderWorkflowSqsRecordFixture('message-1'),
          orderWorkflowSqsRecordFixture(
            'message-2',
            inventoryOutcomeMessageBodyFixture(inventoryRejectedFixture()),
          ),
        ]),
      ),
    ).resolves.toEqual({ batchItemFailures: [] });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  test('returns the SQS messageId for malformed JSON', async () => {
    const handler = createOrderWorkflowSqsHandler(processor);

    await expect(
      handler(
        orderWorkflowSqsEventFixture([
          orderWorkflowSqsRecordFixture('malformed-message', '{not-json'),
        ]),
      ),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: 'malformed-message' }],
    });
    expect(execute).not.toHaveBeenCalled();
  });

  test('returns the SQS messageId for an invalid event', async () => {
    const invalidEnvelope = {
      ...inventoryOutcomeEnvelopeFixture(),
      source: 'untrusted.inventory-service',
    };
    const handler = createOrderWorkflowSqsHandler(processor);

    await expect(
      handler(
        orderWorkflowSqsEventFixture([
          orderWorkflowSqsRecordFixture('invalid-message', JSON.stringify(invalidEnvelope)),
        ]),
      ),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: 'invalid-message' }],
    });
  });

  test('returns the SQS messageId when the Order is missing', async () => {
    execute.mockRejectedValue(new OrderNotFoundError(ORDER_ID));
    const handler = createOrderWorkflowSqsHandler(processor);

    await expect(
      handler(orderWorkflowSqsEventFixture([orderWorkflowSqsRecordFixture('missing-order')])),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: 'missing-order' }],
    });
  });

  test('returns the SQS messageId for a contradictory terminal state', async () => {
    execute.mockRejectedValue(new OrderWorkflowConflictError(ORDER_ID, 'CONFIRMED', 'REJECTED'));
    const handler = createOrderWorkflowSqsHandler(processor);

    await expect(
      handler(orderWorkflowSqsEventFixture([orderWorkflowSqsRecordFixture('workflow-conflict')])),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: 'workflow-conflict' }],
    });
  });

  test('returns the SQS messageId for a transient DynamoDB error', async () => {
    execute.mockRejectedValue(new Error('DynamoDB throttled'));
    const handler = createOrderWorkflowSqsHandler(processor);

    await expect(
      handler(orderWorkflowSqsEventFixture([orderWorkflowSqsRecordFixture('transient-failure')])),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: 'transient-failure' }],
    });
  });

  test('returns only failed SQS message IDs in a mixed batch', async () => {
    execute
      .mockResolvedValueOnce(ORDER_WORKFLOW_TRANSITION_RESULT.UPDATED)
      .mockRejectedValueOnce(new Error('DynamoDB unavailable'))
      .mockResolvedValueOnce(ORDER_WORKFLOW_TRANSITION_RESULT.ALREADY_APPLIED);
    const handler = createOrderWorkflowSqsHandler(processor);

    await expect(
      handler(
        orderWorkflowSqsEventFixture([
          orderWorkflowSqsRecordFixture('successful-message'),
          orderWorkflowSqsRecordFixture('failed-message'),
          orderWorkflowSqsRecordFixture('duplicate-message'),
        ]),
      ),
    ).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: 'failed-message' }],
    });
  });

  test('never substitutes event or Order identifiers for the failed SQS messageId', async () => {
    execute.mockRejectedValue(new Error('transient failure'));
    const handler = createOrderWorkflowSqsHandler(processor);

    const response = await handler(
      orderWorkflowSqsEventFixture([orderWorkflowSqsRecordFixture('sqs-message-id')]),
    );

    expect(response.batchItemFailures).toEqual([{ itemIdentifier: 'sqs-message-id' }]);
    expect(response.batchItemFailures[0]?.itemIdentifier).not.toBe(
      inventoryReservedFixture().eventId,
    );
    expect(response.batchItemFailures[0]?.itemIdentifier).not.toBe(ORDER_ID);
  });

  test('continues processing after one record fails', async () => {
    execute.mockResolvedValue(ORDER_WORKFLOW_TRANSITION_RESULT.UPDATED);
    const handler = createOrderWorkflowSqsHandler(processor);

    const response = await handler(
      orderWorkflowSqsEventFixture([
        orderWorkflowSqsRecordFixture('malformed-message', '{not-json'),
        orderWorkflowSqsRecordFixture('valid-message'),
      ]),
    );

    expect(response).toEqual({
      batchItemFailures: [{ itemIdentifier: 'malformed-message' }],
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
