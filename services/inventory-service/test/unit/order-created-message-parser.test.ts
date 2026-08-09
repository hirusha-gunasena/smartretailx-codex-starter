import { parseOrderCreatedMessage } from '../../src/index.js';
import {
  eventBridgeEnvelopeFixture,
  eventBridgeMessageBodyFixture,
  orderCreatedFixture,
} from '../support/fixtures.js';

describe('parseOrderCreatedMessage', () => {
  test('accepts an EventBridge-wrapped canonical OrderCreated event', () => {
    expect(parseOrderCreatedMessage(eventBridgeMessageBodyFixture())).toEqual(
      orderCreatedFixture(),
    );
  });

  test('rejects malformed JSON', () => {
    expect(() => parseOrderCreatedMessage('{not-json')).toThrow(SyntaxError);
  });

  test('rejects the wrong detail type', () => {
    expect(() =>
      parseOrderCreatedMessage(
        JSON.stringify({ ...eventBridgeEnvelopeFixture(), 'detail-type': 'OrderConfirmed' }),
      ),
    ).toThrow();
  });

  test('rejects the wrong EventBridge source', () => {
    expect(() =>
      parseOrderCreatedMessage(
        JSON.stringify({ ...eventBridgeEnvelopeFixture(), source: 'untrusted.order-service' }),
      ),
    ).toThrow();
  });

  test('rejects a missing detail', () => {
    const withoutDetail = { ...eventBridgeEnvelopeFixture() };
    Reflect.deleteProperty(withoutDetail, 'detail');
    expect(() => parseOrderCreatedMessage(JSON.stringify(withoutDetail))).toThrow();
  });

  test('rejects malformed canonical detail', () => {
    const envelope = eventBridgeEnvelopeFixture();
    expect(() =>
      parseOrderCreatedMessage(
        JSON.stringify({
          ...envelope,
          detail: { ...envelope.detail, eventId: 'not-a-uuid' },
        }),
      ),
    ).toThrow();
  });

  test('preserves nested order items', () => {
    const detail = orderCreatedFixture({
      data: {
        ...orderCreatedFixture().data,
        items: [
          ...orderCreatedFixture().data.items,
          {
            productId: '550e8400-e29b-41d4-a716-446655440005',
            quantity: 3,
            unitPrice: 5,
          },
        ],
      },
    });

    expect(parseOrderCreatedMessage(eventBridgeMessageBodyFixture(detail)).data.items).toEqual(
      detail.data.items,
    );
  });
});
