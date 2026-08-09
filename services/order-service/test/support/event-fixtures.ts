import { marshall } from '@aws-sdk/util-dynamodb';
import type { Order } from '@smartretailx/api-contracts';
import type { AttributeValue, DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda';
import { orderFixture } from './fixtures.js';

export const streamRecordFixture = (
  order: Order = orderFixture(),
  overrides: Partial<DynamoDBRecord> = {},
): DynamoDBRecord => ({
  eventName: 'INSERT',
  dynamodb: {
    SequenceNumber: '100000000000000000001',
    NewImage: marshall(order) as Record<string, AttributeValue>,
  },
  ...overrides,
});

export const streamEventFixture = (records: readonly DynamoDBRecord[]): DynamoDBStreamEvent => ({
  Records: [...records],
});
