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
import type {
  ConfirmedOrderWorkflowTransition,
  RejectedOrderWorkflowTransition,
} from '../../src/index.js';
import {
  CREATED_AT,
  ORDER_ID,
  REJECTION_REASON,
  RESERVATION_ID,
  confirmedOrderFixture,
  orderFixture,
  rejectedOrderFixture,
} from '../support/fixtures.js';
import { OUTCOME_OCCURRED_AT } from '../support/inventory-outcome-fixtures.js';

const TABLE_NAME = 'OrdersTable';

const confirmedTransition = (
  overrides: Partial<ConfirmedOrderWorkflowTransition> = {},
): ConfirmedOrderWorkflowTransition => ({
  orderId: ORDER_ID,
  targetStatus: 'CONFIRMED',
  reservationId: RESERVATION_ID,
  updatedAt: OUTCOME_OCCURRED_AT,
  ...overrides,
});

const rejectedTransition = (
  overrides: Partial<RejectedOrderWorkflowTransition> = {},
): RejectedOrderWorkflowTransition => ({
  orderId: ORDER_ID,
  targetStatus: 'REJECTED',
  rejectionReason: REJECTION_REASON,
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

  test('a CONFIRMED transition sets status, updatedAt, and reservationId only', async () => {
    send.mockResolvedValue({});

    await repository.transitionFromPending(confirmedTransition());

    const command = send.mock.calls[0]![0] as UpdateCommand;
    expect(command.input.UpdateExpression).toBe(
      'SET #status = :targetStatus, #updatedAt = :updatedAt, #reservationId = :reservationId REMOVE #rejectionReason',
    );
    expect(command.input.ExpressionAttributeNames).toMatchObject({
      '#status': 'status',
      '#updatedAt': 'updatedAt',
    });
    expect(command.input.ExpressionAttributeValues).toMatchObject({
      ':targetStatus': 'CONFIRMED',
      ':updatedAt': OUTCOME_OCCURRED_AT,
      ':reservationId': RESERVATION_ID,
    });
    expect(command.input.ExpressionAttributeValues).not.toHaveProperty(':rejectionReason');
    expect(command).not.toBeInstanceOf(PutCommand);
    expect(command.input).not.toHaveProperty('Item');
    expect(command.input.UpdateExpression).not.toMatch(
      /customerId|items|totalAmount|currency|createdAt/u,
    );
  });

  test('supports CONFIRMED as the target state', async () => {
    send.mockResolvedValue({});

    await repository.transitionFromPending(confirmedTransition());

    const command = send.mock.calls[0]![0] as UpdateCommand;
    expect(command.input.ExpressionAttributeValues?.[':targetStatus']).toBe('CONFIRMED');
  });

  test('supports REJECTED as the target state', async () => {
    send.mockResolvedValue({});

    await repository.transitionFromPending(rejectedTransition());

    const command = send.mock.calls[0]![0] as UpdateCommand;
    expect(command.input.ExpressionAttributeValues?.[':targetStatus']).toBe('REJECTED');
    expect(command.input.ExpressionAttributeValues?.[':rejectionReason']).toBe(REJECTION_REASON);
    expect(command.input.ExpressionAttributeValues).not.toHaveProperty(':reservationId');
    expect(command.input.UpdateExpression).toBe(
      'SET #status = :targetStatus, #updatedAt = :updatedAt, #rejectionReason = :rejectionReason REMOVE #reservationId',
    );
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
      Item: confirmedOrderFixture({ updatedAt: OUTCOME_OCCURRED_AT }),
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
      Item: confirmedOrderFixture({ updatedAt: CREATED_AT }),
    });

    await expect(repository.transitionFromPending(confirmedTransition())).resolves.toBe(
      ORDER_WORKFLOW_TRANSITION_RESULT.ALREADY_APPLIED,
    );
  });

  test('returns ALREADY_APPLIED when current status equals REJECTED', async () => {
    send.mockRejectedValueOnce(conditionalFailure()).mockResolvedValueOnce({
      Item: rejectedOrderFixture({ updatedAt: CREATED_AT }),
    });

    await expect(repository.transitionFromPending(rejectedTransition())).resolves.toBe(
      ORDER_WORKFLOW_TRANSITION_RESULT.ALREADY_APPLIED,
    );
  });

  test('a duplicate performs no second update and preserves durable metadata and updatedAt', async () => {
    const storedOrder = confirmedOrderFixture({ updatedAt: CREATED_AT });
    send.mockRejectedValueOnce(conditionalFailure()).mockResolvedValueOnce({ Item: storedOrder });

    await repository.transitionFromPending(confirmedTransition());

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.filter(([command]) => command instanceof UpdateCommand)).toHaveLength(1);
    expect(storedOrder.updatedAt).toBe(CREATED_AT);
    expect(storedOrder.reservationId).toBe(RESERVATION_ID);
  });

  test('throws OrderNotFoundError when classification finds no Order', async () => {
    send.mockRejectedValueOnce(conditionalFailure()).mockResolvedValueOnce({});

    await expect(repository.transitionFromPending(confirmedTransition())).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });

  test('throws OrderWorkflowConflictError for CONFIRMED plus desired REJECTED', async () => {
    send.mockRejectedValueOnce(conditionalFailure()).mockResolvedValueOnce({
      Item: confirmedOrderFixture({ updatedAt: OUTCOME_OCCURRED_AT }),
    });

    await expect(repository.transitionFromPending(rejectedTransition())).rejects.toEqual(
      expect.objectContaining({
        currentStatus: 'CONFIRMED',
        targetStatus: 'REJECTED',
        code: 'ORDER_WORKFLOW_CONFLICT',
      }),
    );
  });

  test('throws OrderWorkflowConflictError for REJECTED plus desired CONFIRMED', async () => {
    send.mockRejectedValueOnce(conditionalFailure()).mockResolvedValueOnce({
      Item: rejectedOrderFixture({ updatedAt: OUTCOME_OCCURRED_AT }),
    });

    await expect(repository.transitionFromPending(confirmedTransition())).rejects.toBeInstanceOf(
      OrderWorkflowConflictError,
    );
  });

  test('throws a conflict when a CONFIRMED duplicate has a different reservationId', async () => {
    send.mockRejectedValueOnce(conditionalFailure()).mockResolvedValueOnce({
      Item: confirmedOrderFixture({
        reservationId: '550e8400-e29b-41d4-a716-446655440099',
        updatedAt: OUTCOME_OCCURRED_AT,
      }),
    });

    await expect(repository.transitionFromPending(confirmedTransition())).rejects.toBeInstanceOf(
      OrderWorkflowConflictError,
    );
  });

  test('throws a conflict when a REJECTED duplicate has a different rejectionReason', async () => {
    send.mockRejectedValueOnce(conditionalFailure()).mockResolvedValueOnce({
      Item: rejectedOrderFixture({
        rejectionReason: 'PRODUCT_NOT_FOUND',
        updatedAt: OUTCOME_OCCURRED_AT,
      }),
    });

    await expect(repository.transitionFromPending(rejectedTransition())).rejects.toBeInstanceOf(
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

  test('fails canonical validation for a legacy CONFIRMED Order without reservationId', async () => {
    send.mockRejectedValueOnce(conditionalFailure()).mockResolvedValueOnce({
      Item: { ...orderFixture(), status: 'CONFIRMED', updatedAt: OUTCOME_OCCURRED_AT },
    });

    await expect(repository.transitionFromPending(confirmedTransition())).rejects.toThrow();
  });

  test('fails canonical validation for a legacy REJECTED Order without rejectionReason', async () => {
    send.mockRejectedValueOnce(conditionalFailure()).mockResolvedValueOnce({
      Item: { ...orderFixture(), status: 'REJECTED', updatedAt: OUTCOME_OCCURRED_AT },
    });

    await expect(repository.transitionFromPending(rejectedTransition())).rejects.toThrow();
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
