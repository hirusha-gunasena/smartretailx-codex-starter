import { z } from 'zod';

const portSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, 'PORT must be an integer')
  .transform(Number)
  .pipe(z.number().int().min(1).max(65_535));

export interface OrderServiceConfiguration {
  readonly host: '0.0.0.0';
  readonly port: number;
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
