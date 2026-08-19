import { marshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue, DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda';
import type { InventoryReservation } from '../../src/index.js';
import { reservationFixture } from './fixtures.js';

export const inventoryOutcomeStreamRecordFixture = (
  reservation: InventoryReservation = reservationFixture(),
  overrides: Partial<DynamoDBRecord> = {},
): DynamoDBRecord => ({
  eventName: 'INSERT',
  dynamodb: {
    SequenceNumber: '200000000000000000001',
    NewImage: marshall(reservation) as Record<string, AttributeValue>,
  },
  ...overrides,
});

export const inventoryOutcomeStreamEventFixture = (
  records: readonly DynamoDBRecord[],
): DynamoDBStreamEvent => ({ Records: [...records] });
