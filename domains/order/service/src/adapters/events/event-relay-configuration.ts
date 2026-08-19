import { z } from 'zod';

const eventRelayEnvironmentSchema = z.object({
  ORDER_EVENT_BUS_NAME: z
    .string({ error: 'ORDER_EVENT_BUS_NAME is required for the order event relay' })
    .trim()
    .min(1, 'ORDER_EVENT_BUS_NAME must not be empty'),
});

export interface EventRelayConfiguration {
  readonly eventBusName: string;
}

export const readEventRelayConfiguration = (
  environment: NodeJS.ProcessEnv = process.env,
): EventRelayConfiguration => {
  const parsedEnvironment = eventRelayEnvironmentSchema.parse(environment);

  return { eventBusName: parsedEnvironment.ORDER_EVENT_BUS_NAME };
};
