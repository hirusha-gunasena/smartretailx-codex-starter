import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { jest } from '@jest/globals';
import { DynamoDbProductRepository } from '../src/index.js';
import { PRODUCT_ID, SECOND_PRODUCT_ID, productFixture } from './support/fixtures.js';

const TABLE_NAME = 'ProductsTable';

const conditionalFailure = (): ConditionalCheckFailedException =>
  new ConditionalCheckFailedException({
    $metadata: {},
    message: 'The condition was not satisfied',
  });

describe('DynamoDbProductRepository', () => {
  let send = jest.fn<(command: unknown) => Promise<unknown>>();
  let repository: DynamoDbProductRepository;

  beforeEach(() => {
    send = jest.fn<(command: unknown) => Promise<unknown>>();
    repository = new DynamoDbProductRepository(
      { send } as unknown as DynamoDBDocumentClient,
      TABLE_NAME,
    );
  });

  test('create sends the expected PutCommand', async () => {
    send.mockResolvedValue({});

    await expect(repository.create(productFixture())).resolves.toBe(true);

    const command = send.mock.calls[0]![0] as PutCommand;
    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input).toEqual(
      expect.objectContaining({
        TableName: TABLE_NAME,
        Item: productFixture(),
      }),
    );
  });

  test('create uses an attribute-not-exists condition', async () => {
    send.mockResolvedValue({});

    await repository.create(productFixture());

    const command = send.mock.calls[0]![0] as PutCommand;
    expect(command.input.ConditionExpression).toBe('attribute_not_exists(productId)');
  });

  test('create returns false for a duplicate conditional failure', async () => {
    send.mockRejectedValue(conditionalFailure());

    await expect(repository.create(productFixture())).resolves.toBe(false);
  });

  test('findById returns a validated existing product', async () => {
    send.mockResolvedValue({ Item: productFixture() });

    await expect(repository.findById(PRODUCT_ID)).resolves.toEqual(productFixture());

    const command = send.mock.calls[0]![0] as GetCommand;
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input).toEqual({ TableName: TABLE_NAME, Key: { productId: PRODUCT_ID } });
  });

  test('findById returns null when the product is absent', async () => {
    send.mockResolvedValue({});

    await expect(repository.findById(PRODUCT_ID)).resolves.toBeNull();
  });

  test('findById rejects a corrupted stored product', async () => {
    send.mockResolvedValue({ Item: { ...productFixture(), productId: 'corrupted-id' } });

    await expect(repository.findById(PRODUCT_ID)).rejects.toThrow();
  });

  test('list returns an empty list', async () => {
    send.mockResolvedValue({ Items: [] });

    await expect(repository.list()).resolves.toEqual([]);
  });

  test('list returns multiple validated products', async () => {
    const products = [productFixture(), productFixture({ productId: SECOND_PRODUCT_ID })];
    send.mockResolvedValue({ Items: products });

    await expect(repository.list()).resolves.toEqual(products);

    expect(send.mock.calls[0]![0]).toBeInstanceOf(ScanCommand);
  });

  test('list follows LastEvaluatedKey pagination until all items are returned', async () => {
    const lastEvaluatedKey = { productId: PRODUCT_ID };
    send
      .mockResolvedValueOnce({
        Items: [productFixture()],
        LastEvaluatedKey: lastEvaluatedKey,
      })
      .mockResolvedValueOnce({
        Items: [productFixture({ productId: SECOND_PRODUCT_ID })],
      });

    await expect(repository.list()).resolves.toEqual([
      productFixture(),
      productFixture({ productId: SECOND_PRODUCT_ID }),
    ]);

    expect(send).toHaveBeenCalledTimes(2);
    const secondCommand = send.mock.calls[1]![0] as ScanCommand;
    expect(secondCommand.input.ExclusiveStartKey).toEqual(lastEvaluatedKey);
  });

  test('update conditionally changes mutable fields without writing createdAt', async () => {
    send.mockResolvedValue({});

    await expect(repository.update(productFixture())).resolves.toBe(true);

    const command = send.mock.calls[0]![0] as UpdateCommand;
    expect(command).toBeInstanceOf(UpdateCommand);
    expect(command.input.ConditionExpression).toBe('attribute_exists(productId)');
    expect(command.input.Key).toEqual({ productId: PRODUCT_ID });
    expect(command.input.UpdateExpression).not.toContain('createdAt');
  });

  test('update returns false when its conditional target is missing', async () => {
    send.mockRejectedValue(conditionalFailure());

    await expect(repository.update(productFixture())).resolves.toBe(false);
  });

  test('delete succeeds with an existence condition', async () => {
    send.mockResolvedValue({});

    await expect(repository.delete(PRODUCT_ID)).resolves.toBe(true);

    const command = send.mock.calls[0]![0] as DeleteCommand;
    expect(command).toBeInstanceOf(DeleteCommand);
    expect(command.input).toEqual({
      TableName: TABLE_NAME,
      Key: { productId: PRODUCT_ID },
      ConditionExpression: 'attribute_exists(productId)',
    });
  });

  test('delete returns false when its conditional target is missing', async () => {
    send.mockRejectedValue(conditionalFailure());

    await expect(repository.delete(PRODUCT_ID)).resolves.toBe(false);
  });

  test('unexpected AWS errors propagate unchanged', async () => {
    const failure = new Error('network unavailable');
    send.mockRejectedValue(failure);

    await expect(repository.create(productFixture())).rejects.toBe(failure);
  });
});
