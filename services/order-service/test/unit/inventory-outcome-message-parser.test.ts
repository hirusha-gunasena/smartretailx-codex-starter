import { parseInventoryOutcomeMessage } from '../../src/index.js';
import { ORDER_ID } from '../support/fixtures.js';
import {
  inventoryOutcomeEnvelopeFixture,
  inventoryOutcomeMessageBodyFixture,
  inventoryRejectedFixture,
  inventoryReservedFixture,
} from '../support/inventory-outcome-fixtures.js';

describe('parseInventoryOutcomeMessage', () => {
  test('accepts an EventBridge-wrapped canonical InventoryReserved event', () => {
    expect(parseInventoryOutcomeMessage(inventoryOutcomeMessageBodyFixture())).toEqual(
      inventoryReservedFixture(),
    );
  });

  test('accepts an EventBridge-wrapped canonical InventoryRejected event', () => {
    const detail = inventoryRejectedFixture();

    expect(parseInventoryOutcomeMessage(inventoryOutcomeMessageBodyFixture(detail))).toEqual(
      detail,
    );
  });

  test('rejects malformed JSON', () => {
    expect(() => parseInventoryOutcomeMessage('{not-json')).toThrow(SyntaxError);
  });

  test('rejects the wrong EventBridge source', () => {
    expect(() =>
      parseInventoryOutcomeMessage(
        JSON.stringify({
          ...inventoryOutcomeEnvelopeFixture(),
          source: 'untrusted.inventory-service',
        }),
      ),
    ).toThrow();
  });

  test('rejects an unsupported detail type', () => {
    expect(() =>
      parseInventoryOutcomeMessage(
        JSON.stringify({
          ...inventoryOutcomeEnvelopeFixture(),
          'detail-type': 'OrderCreated',
        }),
      ),
    ).toThrow();
  });

  test('rejects a missing detail', () => {
    const envelope = { ...inventoryOutcomeEnvelopeFixture() };
    Reflect.deleteProperty(envelope, 'detail');

    expect(() => parseInventoryOutcomeMessage(JSON.stringify(envelope))).toThrow();
  });

  test('rejects malformed canonical detail', () => {
    const envelope = inventoryOutcomeEnvelopeFixture();

    expect(() =>
      parseInventoryOutcomeMessage(
        JSON.stringify({
          ...envelope,
          detail: { ...envelope.detail, eventId: 'not-a-uuid' },
        }),
      ),
    ).toThrow();
  });

  test('rejects InventoryReserved detail-type with InventoryRejected detail', () => {
    expect(() =>
      parseInventoryOutcomeMessage(
        JSON.stringify({
          ...inventoryOutcomeEnvelopeFixture(inventoryRejectedFixture()),
          'detail-type': 'InventoryReserved',
        }),
      ),
    ).toThrow();
  });

  test('rejects InventoryRejected detail-type with InventoryReserved detail', () => {
    expect(() =>
      parseInventoryOutcomeMessage(
        JSON.stringify({
          ...inventoryOutcomeEnvelopeFixture(inventoryReservedFixture()),
          'detail-type': 'InventoryRejected',
        }),
      ),
    ).toThrow();
  });

  test('preserves orderId from the canonical detail', () => {
    expect(parseInventoryOutcomeMessage(inventoryOutcomeMessageBodyFixture()).data.orderId).toBe(
      ORDER_ID,
    );
  });

  test('preserves correlationId from the canonical detail', () => {
    expect(parseInventoryOutcomeMessage(inventoryOutcomeMessageBodyFixture()).correlationId).toBe(
      ORDER_ID,
    );
  });
});
