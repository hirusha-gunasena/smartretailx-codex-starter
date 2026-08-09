import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { jest } from '@jest/globals';
import {
  DynamoDBOrderWorkflowRepository,
  ORDER_WORKFLOW_TRANSITION_RESULT,
  OrderNotFoundError,
  OrderWorkflowConflictError,
  OrderWorkflowValidationError,
} from '../../src/index.js';
import type { OrderWorkflowTransition } from '../../src/index.js';
import { CREATED_AT, ORDER_ID, orderFixture } from '../support/fixtures.js';
import { OUTCOME_OCCURRED_AT } from '../support/inventory-outcome-fixtures.js';

const TABLE_NAME = 'OrdersTable';

const confirmedTransition = (
  overrides: Partial<OrderWorkflowTransition> = {},
): OrderWorkflowTransition => ({
  orderId: ORDER_ID,
  targetStatus: 'CONFIRMED',
  updatedAt: OUTCOME_OCCURRED_AT,
  ...overrides,
});

const conditionalFailure = (): ConditionalCheckFailedException =>
  new ConditionalCheckFailedException({
    $metadata: {},
    message: 'The condition was not satisfied',
  });

describe('DynamoDBOrderWorkflowRepository', () => {
  let send = jest.fn<(command: unknown) => Promise<unknown>>();
  let repository: DynamoDBOrderWorkflowRepository;

  beforeEach(() => {
    send = jest.fn<(command: unknown) => Promise<unknown>>();
    repository = new DynamoDBOrderWorkflowRepository(
      { send } as unknown as DynamoDBDocumentClient,
      TABLE_NAME,
    );
  });

  test('requires a non-empty Orders table name', () => {
    expect(
      () =>
        new DynamoDBOrderWorkflowRepository({ send } as unknown as DynamoDBDocumentClient, '   '),
    ).toThrow('non-empty DynamoDB orders table name');
  });

  test('uses UpdateCommand with the configured Orders table and orderId key', async () => {
    send.mockResolvedValue({});

    await repository.transitionFromPending(confirmedTransition());

    const command = send.mock.calls[0]![0] as UpdateCommand;
    expect(command).toBeInstanceOf(UpdateCommand);
    expect(command.input.TableName).toBe(TABLE_NAME);
    expect(command.input.Key).toEqual({ orderId: ORDER_ID });
  });

  test('updates only status and updatedAt', async () => {
    send.mockResolvedValue({});

    await repository.transitionFromPending(confirmedTransition());

    const command = send.mock.calls[0]![0] as UpdateCommand;
    expect(command.input.UpdateExpression).toBe(
      'SET #status = :targetStatus, #updatedAt = :updatedAt',
    );
    expect(command.input.ExpressionAttributeNames).toMatchObject({
      '#status': 'status',
      '#updatedAt': 'updatedAt',
    });
    expect(command.input.ExpressionAttributeValues).toMatchObject({
      ':targetStatus': 'CONFIRMED',
      ':updatedAt': OUTCOME_OCCURRED_AT,
    });
    expect(command).not.toBeInstanceOf(PutCommand);
    expect(command.input).not.toHaveProperty('Item');
  });

  test('supports CONFIRMED as the target state', async () => {
    send.mockResolvedValue({});

    await repository.transitionFromPending(confirmedTransition());

    const command = send.mock.calls[0]![0] as UpdateCommand;
    expect(command.input.ExpressionAttributeValues?.[':targetStatus']).toBe('CONFIRMED');
  });

  test('supports REJECTED as the target state', async () => {
    send.mockResolvedValue({});

    await repository.transitionFromPending(confirmedTransition({ targetStatus: 'REJECTED' }));

    const command = send.mock.calls[0]![0] as UpdateCommand;
    expect(command.input.ExpressionAttributeValues?.[':targetStatus']).toBe('REJECTED');
  });

  test('requires the Order to exist in its ConditionExpression', async () => {
    send.mockResolvedValue({});

    await repository.transitionFromPending(confirmedTransition());

    const command = send.mock.calls[0]![0] as UpdateCommand;
    expect(command.input.ConditionExpression).toContain('attribute_exists(#orderId)');
    expect(command.input.ExpressionAttributeNames?.['#orderId']).toBe('orderId');
  });

  test('requires PENDING in its ConditionExpression', async () => {
    send.mockResolvedValue({});

    await repository.transitionFromPending(confirmedTransition());

    const command = send.mock.calls[0]![0] as UpdateCommand;
    expect(command.input.ConditionExpression).toContain('#status = :pendingStatus');
    expect(command.input.ExpressionAttributeValues?.[':pendingStatus']).toBe('PENDING');
  });

  test('atomically rejects outcomes that predate createdAt', async () => {
    send.mockResolvedValue({});

    await repository.transitionFromPending(confirmedTransition());

    const command = send.mock.calls[0]![0] as UpdateCommand;
    expect(command.input.ConditionExpression).toContain('#createdAt <= :updatedAt');
    expect(command.input.ExpressionAttributeNames?.['#createdAt']).toBe('createdAt');
  });

  test('returns UPDATED after a successful conditional update', async () => {
    send.mockResolvedValue({});

    await expect(repository.transitionFromPending(confirmedTransition())).resolves.toBe(
      ORDER_WORKFLOW_TRANSITION_RESULT.UPDATED,
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  test('reads the current Order consistently after ConditionalCheckFailedException', async () => {
    send.mockRejectedValueOnce(conditionalFailure()).mockResolvedValueOnce({
      Item: orderFixture({ status: 'CONFIRMED', updatedAt: OUTCOME_OCCURRED_AT }),
    });

    await repository.transitionFromPending(confirmedTransition());

    const command = send.mock.calls[1]![0] as GetCommand;
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input).toEqual({
      TableName: TABLE_NAME,
      Key: { orderId: ORDER_ID },
      ConsistentRead: true,
    });
  });

  test('returns ALREADY_APPLIED when current status equals CONFIRMED', async () => {
    send.mockRejectedValueOnce(conditionalFailure()).mockResolvedValueOnce({
      Item: orderFixture({ status: 'CONFIRMED', updatedAt: CREATED_AT }),
    });

    await expect(repository.transitionFromPending(confirmedTransition())).resolves.toBe(
      ORDER_WORKFLOW_TRANSITION_RESULT.ALREADY_APPLIED,
    );
  });

  test('returns ALREADY_APPLIED when current status equals REJECTED', async () => {
    send.mockRejectedValueOnce(conditionalFailure()).mockResolvedValueOnce({
      Item: orderFixture({ status: 'REJECTED', updatedAt: CREATED_AT }),
    });

    await expect(
      repository.transitionFromPending(confirmedTransition({ targetStatus: 'REJECTED' })),
    ).resolves.toBe(ORDER_WORKFLOW_TRANSITION_RESULT.ALREADY_APPLIED);
  });

  test('a duplicate performs no second update and preserves the original updatedAt', async () => {
    const storedOrder = orderFixture({ status: 'CONFIRMED', updatedAt: CREATED_AT });
    send.mockRejectedValueOnce(conditionalFailure()).mockResolvedValueOnce({ Item: storedOrder });

    await repository.transitionFromPending(confirmedTransition());

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.filter(([command]) => command instanceof UpdateCommand)).toHaveLength(1);
    expect(storedOrder.updatedAt).toBe(CREATED_AT);
  });

  test('throws OrderNotFoundError when classification finds no Order', async () => {
    send.mockRejectedValueOnce(conditionalFailure()).mockResolvedValueOnce({});

    await expect(repository.transitionFromPending(confirmedTransition())).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });

  test('throws OrderWorkflowConflictError for CONFIRMED plus desired REJECTED', async () => {
    send.mockRejectedValueOnce(conditionalFailure()).mockResolvedValueOnce({
      Item: orderFixture({ status: 'CONFIRMED', updatedAt: OUTCOME_OCCURRED_AT }),
    });

    await expect(
      repository.transitionFromPending(confirmedTransition({ targetStatus: 'REJECTED' })),
    ).rejects.toEqual(
      expect.objectContaining({
        currentStatus: 'CONFIRMED',
        targetStatus: 'REJECTED',
        code: 'ORDER_WORKFLOW_CONFLICT',
      }),
    );
  });

  test('throws OrderWorkflowConflictError for REJECTED plus desired CONFIRMED', async () => {
    send.mockRejectedValueOnce(conditionalFailure()).mockResolvedValueOnce({
      Item: orderFixture({ status: 'REJECTED', updatedAt: OUTCOME_OCCURRED_AT }),
    });

    await expect(repository.transitionFromPending(confirmedTransition())).rejects.toBeInstanceOf(
      OrderWorkflowConflictError,
    );
  });

  test('rejects a PENDING Order when the outcome timestamp predates createdAt', async () => {
    send
      .mockRejectedValueOnce(conditionalFailure())
      .mockResolvedValueOnce({ Item: orderFixture() });

    await expect(
      repository.transitionFromPending(
        confirmedTransition({ updatedAt: '2026-08-09T08:29:59.999Z' }),
      ),
    ).rejects.toBeInstanceOf(OrderWorkflowValidationError);
  });

  test('rejects an unexplained conditional failure for a valid PENDING Order', async () => {
    send
      .mockRejectedValueOnce(conditionalFailure())
      .mockResolvedValueOnce({ Item: orderFixture() });

    await expect(repository.transitionFromPending(confirmedTransition())).rejects.toEqual(
      expect.objectContaining({ code: 'ORDER_WORKFLOW_INVALID' }),
    );
  });

  test('fails canonical validation for a malformed stored Order', async () => {
    send
      .mockRejectedValueOnce(conditionalFailure())
      .mockResolvedValueOnce({ Item: { ...orderFixture(), orderId: 'not-a-uuid' } });

    await expect(repository.transitionFromPending(confirmedTransition())).rejects.toThrow();
  });

  test('propagates unexpected UpdateCommand errors unchanged', async () => {
    const failure = new Error('DynamoDB throttled');
    send.mockRejectedValue(failure);

    await expect(repository.transitionFromPending(confirmedTransition())).rejects.toBe(failure);
    expect(send).toHaveBeenCalledTimes(1);
  });

  test('propagates unexpected GetCommand errors unchanged', async () => {
    const failure = new Error('DynamoDB unavailable');
    send.mockRejectedValueOnce(conditionalFailure()).mockRejectedValueOnce(failure);

    await expect(repository.transitionFromPending(confirmedTransition())).rejects.toBe(failure);
  });

  test('does not include credentials or EventBridge publication in DynamoDB commands', async () => {
    send.mockResolvedValue({});

    await repository.transitionFromPending(confirmedTransition());

    const command = send.mock.calls[0]![0] as UpdateCommand;
    expect(JSON.stringify(command.input)).not.toMatch(
      /credential|accessKey|secretKey|EventBridge/i,
    );
  });
});
