import { jest } from '@jest/globals';
import { ConsoleOrderAuthorizationTelemetry } from '../../src/index.js';

describe('ConsoleOrderAuthorizationTelemetry', () => {
  test('emits one structured safe authorization record', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    new ConsoleOrderAuthorizationTelemetry().record({
      event: 'order.authorization',
      method: 'GET',
      route: '/api/v1/orders',
      decision: 'ALLOW',
      reasonCode: 'AUTH_ALLOWED',
      tokenUse: 'access',
      subjectPresent: true,
      scopePresent: true,
      role: 'customer',
    });

    expect(info).toHaveBeenCalledTimes(1);
    const serialized = String(info.mock.calls[0]?.[0]);
    expect(JSON.parse(serialized)).toEqual(
      expect.objectContaining({
        decision: 'ALLOW',
        reasonCode: 'AUTH_ALLOWED',
        role: 'customer',
        subjectPresent: true,
      }),
    );
    expect(serialized).not.toMatch(/bearer|jwt|opaque-subject|email|password|request body/iu);
    info.mockRestore();
  });
});
