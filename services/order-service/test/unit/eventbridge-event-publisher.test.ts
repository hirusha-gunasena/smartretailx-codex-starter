import { PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { orderCreatedEventSchema } from '@smartretailx/event-contracts';
import type { OrderCreatedEvent } from '@smartretailx/event-contracts';
import { jest } from '@jest/globals';
import {
  EventBridgeEventPublisher,
  EventPublicationError,
  mapOrderStreamRecord,
} from '../../src/index.js';
import { streamRecordFixture } from '../support/event-fixtures.js';

const EVENT_BUS_NAME = 'order-events';

const orderCreatedEventFixture = (): OrderCreatedEvent =>
  orderCreatedEventSchema.parse(mapOrderStreamRecord(streamRecordFixture()));

describe('EventBridgeEventPublisher', () => {
  let send = jest.fn<(command: unknown) => Promise<unknown>>();
  let publisher: EventBridgeEventPublisher;

  beforeEach(() => {
    send = jest.fn<(command: unknown) => Promise<unknown>>();
    publisher = new EventBridgeEventPublisher(
      { send } as unknown as EventBridgeClient,
      EVENT_BUS_NAME,
    );
  });

  const successfulPublication = (): void => {
    send.mockResolvedValue({
      FailedEntryCount: 0,
      Entries: [{ EventId: 'eventbridge-entry-id' }],
    });
  };

  test('sends PutEventsCommand', async () => {
    successfulPublication();

    await publisher.publish(orderCreatedEventFixture());

    expect(send.mock.calls[0]![0]).toBeInstanceOf(PutEventsCommand);
  });

  test('uses the configured EventBusName', async () => {
    successfulPublication();

    await publisher.publish(orderCreatedEventFixture());

    const command = send.mock.calls[0]![0] as PutEventsCommand;
    expect(command.input.Entries?.[0]?.EventBusName).toBe(EVENT_BUS_NAME);
  });

  test('uses the EventBridge source smartretailx.order-service', async () => {
    successfulPublication();

    await publisher.publish(orderCreatedEventFixture());

    const command = send.mock.calls[0]![0] as PutEventsCommand;
    expect(command.input.Entries?.[0]?.Source).toBe('smartretailx.order-service');
  });

  test('uses OrderCreated as DetailType', async () => {
    successfulPublication();

    await publisher.publish(orderCreatedEventFixture());

    const command = send.mock.calls[0]![0] as PutEventsCommand;
    expect(command.input.Entries?.[0]?.DetailType).toBe('OrderCreated');
  });

  test('serializes the complete canonical event as Detail', async () => {
    const event = orderCreatedEventFixture();
    successfulPublication();

    await publisher.publish(event);

    const command = send.mock.calls[0]![0] as PutEventsCommand;
    expect(
      orderCreatedEventSchema.parse(JSON.parse(command.input.Entries?.[0]?.Detail ?? '')),
    ).toEqual(event);
  });

  test('treats FailedEntryCount zero as success', async () => {
    successfulPublication();

    await expect(publisher.publish(orderCreatedEventFixture())).resolves.toBeUndefined();
  });

  test('turns a failed entry into EventPublicationError with safe context', async () => {
    send.mockResolvedValue({
      FailedEntryCount: 1,
      Entries: [{ ErrorCode: 'InternalFailure', ErrorMessage: 'internal provider detail' }],
    });

    const publication = publisher.publish(orderCreatedEventFixture());

    await expect(publication).rejects.toBeInstanceOf(EventPublicationError);
    await expect(publication).rejects.toMatchObject({
      code: 'EVENT_PUBLICATION_FAILED',
      eventBridgeErrorCode: 'InternalFailure',
    });
  });

  test('propagates unexpected EventBridge SDK exceptions unchanged', async () => {
    const failure = new Error('network unavailable');
    send.mockRejectedValue(failure);

    await expect(publisher.publish(orderCreatedEventFixture())).rejects.toBe(failure);
  });

  test('does not embed credentials, account IDs, or ARNs in the EventBridge entry', async () => {
    successfulPublication();

    await publisher.publish(orderCreatedEventFixture());

    const command = send.mock.calls[0]![0] as PutEventsCommand;
    const entry = command.input.Entries?.[0];
    expect(Object.keys(entry ?? {}).sort()).toEqual([
      'Detail',
      'DetailType',
      'EventBusName',
      'Source',
    ]);
    expect(JSON.stringify(entry)).not.toMatch(/arn:aws|accessKey|secret|credential/iu);
  });
});
