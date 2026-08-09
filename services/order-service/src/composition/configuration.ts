import { z } from 'zod';

const portSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, 'PORT must be an integer')
  .transform(Number)
  .pipe(z.number().int().min(1).max(65_535));

const productionEnvironmentSchema = z.object({
  ORDERS_TABLE_NAME: z
    .string({ error: 'ORDERS_TABLE_NAME is required for production persistence' })
    .trim()
    .min(1, 'ORDERS_TABLE_NAME must not be empty'),
});

export interface OrderServiceConfiguration {
  readonly host: '0.0.0.0';
  readonly port: number;
}

export interface ProductionOrderServiceConfiguration extends OrderServiceConfiguration {
  readonly ordersTableName: string;
}

export const readConfiguration = (
  environment: NodeJS.ProcessEnv = process.env,
): OrderServiceConfiguration => {
  const configuredPort = environment.PORT;
  const port = configuredPort === undefined ? 3_000 : portSchema.parse(configuredPort);

  return {
    host: '0.0.0.0',
    port,
  };
};

export const readProductionConfiguration = (
  environment: NodeJS.ProcessEnv = process.env,
): ProductionOrderServiceConfiguration => {
  const configuration = readConfiguration(environment);
  const productionEnvironment = productionEnvironmentSchema.parse(environment);

  return {
    ...configuration,
    ordersTableName: productionEnvironment.ORDERS_TABLE_NAME,
  };
};
