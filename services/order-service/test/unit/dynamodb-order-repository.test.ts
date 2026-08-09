import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { jest } from '@jest/globals';
import { DynamoDBOrderRepository } from '../../src/index.js';
import { ORDER_ID, SECOND_ORDER_ID, orderFixture } from '../support/fixtures.js';

const TABLE_NAME = 'OrdersTable';

const conditionalFailure = (): ConditionalCheckFailedException =>
  new ConditionalCheckFailedException({
    $metadata: {},
    message: 'The condition was not satisfied',
  });

describe('DynamoDBOrderRepository', () => {
  let send = jest.fn<(command: unknown) => Promise<unknown>>();
  let repository: DynamoDBOrderRepository;

  beforeEach(() => {
    send = jest.fn<(command: unknown) => Promise<unknown>>();
    repository = new DynamoDBOrderRepository(
      { send } as unknown as DynamoDBDocumentClient,
      TABLE_NAME,
    );
  });

  test('create sends PutCommand to the configured table with the complete order', async () => {
    const order = orderFixture();
    send.mockResolvedValue({});

    await repository.create(order);

    const command = send.mock.calls[0]![0] as PutCommand;
    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input.TableName).toBe(TABLE_NAME);
    expect(command.input.Item).toEqual(order);
  });

  test('create protects orderId with an attribute-not-exists condition', async () => {
    send.mockResolvedValue({});

    await repository.create(orderFixture());

    const command = send.mock.calls[0]![0] as PutCommand;
    expect(command.input.ConditionExpression).toBe('attribute_not_exists(orderId)');
  });

  test('create returns true after a successful conditional write', async () => {
    send.mockResolvedValue({});

    await expect(repository.create(orderFixture())).resolves.toBe(true);
  });

  test('create returns false for a duplicate conditional failure', async () => {
    send.mockRejectedValue(conditionalFailure());

    await expect(repository.create(orderFixture())).resolves.toBe(false);
  });

  test('create propagates unexpected AWS errors unchanged', async () => {
    const failure = new Error('DynamoDB unavailable');
    send.mockRejectedValue(failure);

    await expect(repository.create(orderFixture())).rejects.toBe(failure);
  });

  test('findById sends GetCommand with the configured table and orderId key', async () => {
    send.mockResolvedValue({ Item: orderFixture() });

    await repository.findById(ORDER_ID);

    const command = send.mock.calls[0]![0] as GetCommand;
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input).toEqual({ TableName: TABLE_NAME, Key: { orderId: ORDER_ID } });
  });

  test('findById returns a validated existing order', async () => {
    send.mockResolvedValue({ Item: orderFixture() });

    await expect(repository.findById(ORDER_ID)).resolves.toEqual(orderFixture());
  });

  test('findById returns null when the order is absent', async () => {
    send.mockResolvedValue({});

    await expect(repository.findById(ORDER_ID)).resolves.toBeNull();
  });

  test('findById rejects a corrupted stored order', async () => {
    send.mockResolvedValue({ Item: { ...orderFixture(), orderId: 'corrupted-id' } });

    await expect(repository.findById(ORDER_ID)).rejects.toThrow();
  });

  test('findById returns nested values isolated from stored item references', async () => {
    const storedOrder = orderFixture();
    send.mockResolvedValue({ Item: storedOrder });

    const firstRead = await repository.findById(ORDER_ID);
    firstRead!.items[0]!.quantity = 999;

    await expect(repository.findById(ORDER_ID)).resolves.toEqual(orderFixture());
    expect(storedOrder.items[0]!.quantity).toBe(2);
  });

  test('findById propagates unexpected AWS errors unchanged', async () => {
    const failure = new Error('DynamoDB unavailable');
    send.mockRejectedValue(failure);

    await expect(repository.findById(ORDER_ID)).rejects.toBe(failure);
  });

  test('list returns an empty result', async () => {
    send.mockResolvedValue({ Items: [] });

    await expect(repository.list()).resolves.toEqual([]);
  });

  test('list returns a validated single-page result', async () => {
    send.mockResolvedValue({ Items: [orderFixture()] });

    await expect(repository.list()).resolves.toEqual([orderFixture()]);
    expect(send.mock.calls[0]![0]).toBeInstanceOf(ScanCommand);
  });

  test('list returns multiple orders', async () => {
    const orders = [orderFixture(), orderFixture({ orderId: SECOND_ORDER_ID })];
    send.mockResolvedValue({ Items: orders });

    await expect(repository.list()).resolves.toEqual(orders);
  });

  test('list collects all DynamoDB pages', async () => {
    send
      .mockResolvedValueOnce({
        Items: [orderFixture()],
        LastEvaluatedKey: { orderId: ORDER_ID },
      })
      .mockResolvedValueOnce({
        Items: [orderFixture({ orderId: SECOND_ORDER_ID })],
      });

    await expect(repository.list()).resolves.toEqual([
      orderFixture(),
      orderFixture({ orderId: SECOND_ORDER_ID }),
    ]);
    expect(send).toHaveBeenCalledTimes(2);
  });

  test('list passes the previous LastEvaluatedKey as ExclusiveStartKey', async () => {
    const lastEvaluatedKey = { orderId: ORDER_ID };
    send
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: lastEvaluatedKey })
      .mockResolvedValueOnce({ Items: [] });

    await repository.list();

    const secondCommand = send.mock.calls[1]![0] as ScanCommand;
    expect(secondCommand.input.ExclusiveStartKey).toEqual(lastEvaluatedKey);
  });

  test('list rejects a corrupted stored order', async () => {
    send.mockResolvedValue({
      Items: [{ ...orderFixture(), items: [{ ...orderFixture().items[0], quantity: 0 }] }],
    });

    await expect(repository.list()).rejects.toThrow();
  });

  test('list returns nested values isolated from stored item references', async () => {
    const storedOrder = orderFixture();
    send.mockResolvedValue({ Items: [storedOrder] });

    const firstList = await repository.list();
    firstList[0]!.items[0]!.quantity = 999;

    await expect(repository.list()).resolves.toEqual([orderFixture()]);
    expect(storedOrder.items[0]!.quantity).toBe(2);
  });

  test('list propagates unexpected AWS errors unchanged', async () => {
    const failure = new Error('DynamoDB unavailable');
    send.mockRejectedValue(failure);

    await expect(repository.list()).rejects.toBe(failure);
  });
});
