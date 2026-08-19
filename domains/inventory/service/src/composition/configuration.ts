import { z } from 'zod';

const inventoryEnvironmentSchema = z.object({
  INVENTORY_TABLE_NAME: z
    .string({ error: 'INVENTORY_TABLE_NAME is required' })
    .trim()
    .min(1, 'INVENTORY_TABLE_NAME must not be empty'),
  INVENTORY_RESERVATIONS_TABLE_NAME: z
    .string({ error: 'INVENTORY_RESERVATIONS_TABLE_NAME is required' })
    .trim()
    .min(1, 'INVENTORY_RESERVATIONS_TABLE_NAME must not be empty'),
});

export interface InventoryServiceConfiguration {
  readonly inventoryTableName: string;
  readonly reservationsTableName: string;
}

export const readInventoryConfiguration = (
  environment: NodeJS.ProcessEnv = process.env,
): InventoryServiceConfiguration => {
  const parsedEnvironment = inventoryEnvironmentSchema.parse(environment);

  return {
    inventoryTableName: parsedEnvironment.INVENTORY_TABLE_NAME,
    reservationsTableName: parsedEnvironment.INVENTORY_RESERVATIONS_TABLE_NAME,
  };
};
