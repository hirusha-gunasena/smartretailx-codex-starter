import { z } from 'zod';

const orderWorkflowEnvironmentSchema = z.object({
  ORDERS_TABLE_NAME: z
    .string({ error: 'ORDERS_TABLE_NAME is required' })
    .trim()
    .min(1, 'ORDERS_TABLE_NAME must not be empty'),
});

export interface OrderWorkflowConfiguration {
  readonly ordersTableName: string;
}

export const readOrderWorkflowConfiguration = (
  environment: NodeJS.ProcessEnv = process.env,
): OrderWorkflowConfiguration => {
  const parsedEnvironment = orderWorkflowEnvironmentSchema.parse(environment);

  return { ordersTableName: parsedEnvironment.ORDERS_TABLE_NAME };
};
