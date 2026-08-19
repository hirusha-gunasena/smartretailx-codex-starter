import {
  createEventRelayHandlerFromEnvironment,
  readEventRelayConfiguration,
} from '../../src/index.js';

describe('event relay configuration', () => {
  test('accepts and trims a valid ORDER_EVENT_BUS_NAME', () => {
    expect(readEventRelayConfiguration({ ORDER_EVENT_BUS_NAME: ' order-events ' })).toEqual({
      eventBusName: 'order-events',
    });
  });

  test('fails relay composition clearly when ORDER_EVENT_BUS_NAME is missing', () => {
    expect(() => createEventRelayHandlerFromEnvironment({})).toThrow(/ORDER_EVENT_BUS_NAME/u);
  });

  test('rejects an empty ORDER_EVENT_BUS_NAME', () => {
    expect(() => readEventRelayConfiguration({ ORDER_EVENT_BUS_NAME: '   ' })).toThrow(
      /ORDER_EVENT_BUS_NAME/u,
    );
  });
});
