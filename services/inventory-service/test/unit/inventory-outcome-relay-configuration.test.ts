import {
  createInventoryOutcomeRelayFromEnvironment,
  readInventoryOutcomeRelayConfiguration,
} from '../../src/index.js';

describe('Inventory outcome relay configuration', () => {
  test('accepts and trims a valid INVENTORY_EVENT_BUS_NAME', () => {
    expect(
      readInventoryOutcomeRelayConfiguration({
        INVENTORY_EVENT_BUS_NAME: ' inventory-events ',
      }),
    ).toEqual({ eventBusName: 'inventory-events' });
  });

  test('fails production relay composition clearly when INVENTORY_EVENT_BUS_NAME is missing', () => {
    expect(() => createInventoryOutcomeRelayFromEnvironment({})).toThrow(
      /INVENTORY_EVENT_BUS_NAME/u,
    );
  });

  test('rejects a whitespace-only INVENTORY_EVENT_BUS_NAME', () => {
    expect(() =>
      readInventoryOutcomeRelayConfiguration({ INVENTORY_EVENT_BUS_NAME: '   ' }),
    ).toThrow(/INVENTORY_EVENT_BUS_NAME/u);
  });
});
