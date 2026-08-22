import { jest } from '@jest/globals';
import { ConsoleSagaTelemetry } from '../../src/index.js';

describe('ConsoleSagaTelemetry', () => {
  test('emits one structured and sanitized Saga success record', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    new ConsoleSagaTelemetry().recordSuccess({
      event: 'saga.success',
      stage: 'INVENTORY_RESERVATION',
      outcome: 'RESERVED',
      requestId: 'request-id',
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      eventType: 'OrderCreated',
      eventVersion: '1.0',
      occurredAt: '2026-08-09T08:00:00.000Z',
      correlationId: '550e8400-e29b-41d4-a716-446655440001',
      orderId: '550e8400-e29b-41d4-a716-446655440002',
    });

    expect(info).toHaveBeenCalledTimes(1);
    const serialized = String(info.mock.calls[0]?.[0]);
    expect(JSON.parse(serialized)).toEqual(
      expect.objectContaining({
        event: 'saga.success',
        stage: 'INVENTORY_RESERVATION',
        outcome: 'RESERVED',
        correlationId: '550e8400-e29b-41d4-a716-446655440001',
      }),
    );
    expect(serialized).not.toMatch(/customerId|items|authorization|bearer|jwt|email|password/iu);
    info.mockRestore();
  });
});
