import { PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import {
  inventoryRejectedEventSchema,
  inventoryReservedEventSchema,
} from '@smartretailx/event-contracts';
import type { InventoryRejectedEvent, InventoryReservedEvent } from '@smartretailx/event-contracts';
import { jest } from '@jest/globals';
import {
  EventBridgeInventoryEventPublisher,
  EventPublicationError,
  mapInventoryOutcomeStreamRecord,
} from '../../src/index.js';
import { rejectedReservationFixture } from '../support/fixtures.js';
import { inventoryOutcomeStreamRecordFixture } from '../support/inventory-outcome-event-fixtures.js';

const EVENT_BUS_NAME = 'inventory-events';

const reservedEventFixture = (): InventoryReservedEvent =>
  inventoryReservedEventSchema.parse(
    mapInventoryOutcomeStreamRecord(inventoryOutcomeStreamRecordFixture()),
  );

const rejectedEventFixture = (): InventoryRejectedEvent =>
  inventoryRejectedEventSchema.parse(
    mapInventoryOutcomeStreamRecord(
      inventoryOutcomeStreamRecordFixture(rejectedReservationFixture()),
    ),
  );

describe('EventBridgeInventoryEventPublisher', () => {
  let send = jest.fn<(command: unknown) => Promise<unknown>>();
  let publisher: EventBridgeInventoryEventPublisher;

  beforeEach(() => {
    send = jest.fn<(command: unknown) => Promise<unknown>>();
    publisher = new EventBridgeInventoryEventPublisher(
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

  test('sends PutEventsCommand for InventoryReserved', async () => {
    successfulPublication();

    await publisher.publish(reservedEventFixture());

    expect(send.mock.calls[0]![0]).toBeInstanceOf(PutEventsCommand);
  });

  test.each([
    ['InventoryReserved', reservedEventFixture],
    ['InventoryRejected', rejectedEventFixture],
  ] as const)(
    'uses the configured bus, Inventory routing source, and %s DetailType',
    async (eventType, createEvent) => {
      successfulPublication();

      await publisher.publish(createEvent());

      const command = send.mock.calls[0]![0] as PutEventsCommand;
      expect(command.input.Entries?.[0]).toMatchObject({
        EventBusName: EVENT_BUS_NAME,
        Source: 'smartretailx.inventory-service',
        DetailType: eventType,
      });
    },
  );

  test('serializes a complete canonical InventoryReserved event as Detail', async () => {
    const event = reservedEventFixture();
    successfulPublication();

    await publisher.publish(event);

    const command = send.mock.calls[0]![0] as PutEventsCommand;
    expect(
      inventoryReservedEventSchema.parse(JSON.parse(command.input.Entries?.[0]?.Detail ?? '')),
    ).toEqual(event);
  });

  test('serializes a complete canonical InventoryRejected event as Detail', async () => {
    const event = rejectedEventFixture();
    successfulPublication();

    await publisher.publish(event);

    const command = send.mock.calls[0]![0] as PutEventsCommand;
    expect(
      inventoryRejectedEventSchema.parse(JSON.parse(command.input.Entries?.[0]?.Detail ?? '')),
    ).toEqual(event);
  });

  test('treats FailedEntryCount zero and a successful entry as success', async () => {
    successfulPublication();

    await expect(publisher.publish(reservedEventFixture())).resolves.toBeUndefined();
  });

  test('turns a failed entry into typed EventPublicationError with safe context', async () => {
    send.mockResolvedValue({
      FailedEntryCount: 1,
      Entries: [{ ErrorCode: 'InternalFailure', ErrorMessage: 'provider-only detail' }],
    });

    const publication = publisher.publish(rejectedEventFixture());

    await expect(publication).rejects.toBeInstanceOf(EventPublicationError);
    await expect(publication).rejects.toMatchObject({
      code: 'EVENT_PUBLICATION_FAILED',
      eventType: 'InventoryRejected',
      eventBridgeErrorCode: 'InternalFailure',
    });
    await expect(publication).rejects.not.toThrow(/provider-only detail/u);
  });

  test('honors an entry ErrorCode even when FailedEntryCount is zero', async () => {
    send.mockResolvedValue({
      FailedEntryCount: 0,
      Entries: [{ ErrorCode: 'ThrottlingException' }],
    });

    await expect(publisher.publish(reservedEventFixture())).rejects.toMatchObject({
      eventBridgeErrorCode: 'ThrottlingException',
    });
  });

  test('treats a missing result entry as an unknown publication failure', async () => {
    send.mockResolvedValue({ FailedEntryCount: 0, Entries: [] });

    await expect(publisher.publish(reservedEventFixture())).rejects.toMatchObject({
      eventBridgeErrorCode: 'UNKNOWN_EVENTBRIDGE_FAILURE',
    });
  });

  test('propagates unexpected EventBridge SDK exceptions unchanged', async () => {
    const failure = new Error('network unavailable');
    send.mockRejectedValue(failure);

    await expect(publisher.publish(reservedEventFixture())).rejects.toBe(failure);
  });

  test('requires a non-empty configured event bus name', () => {
    expect(() => new EventBridgeInventoryEventPublisher({ send } as never, '   ')).toThrow(
      /non-empty Inventory EventBridge event bus name/u,
    );
  });

  test('does not add credentials, account IDs, regions, or ARNs to the entry', async () => {
    successfulPublication();

    await publisher.publish(reservedEventFixture());

    const command = send.mock.calls[0]![0] as PutEventsCommand;
    const entry = command.input.Entries?.[0];
    expect(Object.keys(entry ?? {}).sort()).toEqual([
      'Detail',
      'DetailType',
      'EventBusName',
      'Source',
    ]);
    expect(JSON.stringify(entry)).not.toMatch(/arn:aws|accessKey|secret|credential|region/iu);
  });
});
