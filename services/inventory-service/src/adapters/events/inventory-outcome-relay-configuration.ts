import { z } from 'zod';

const inventoryOutcomeRelayEnvironmentSchema = z.object({
  INVENTORY_EVENT_BUS_NAME: z
    .string({ error: 'INVENTORY_EVENT_BUS_NAME is required for the Inventory outcome relay' })
    .trim()
    .min(1, 'INVENTORY_EVENT_BUS_NAME must not be empty'),
});

export interface InventoryOutcomeRelayConfiguration {
  readonly eventBusName: string;
}

export const readInventoryOutcomeRelayConfiguration = (
  environment: NodeJS.ProcessEnv = process.env,
): InventoryOutcomeRelayConfiguration => {
  const parsedEnvironment = inventoryOutcomeRelayEnvironmentSchema.parse(environment);
  return { eventBusName: parsedEnvironment.INVENTORY_EVENT_BUS_NAME };
};
