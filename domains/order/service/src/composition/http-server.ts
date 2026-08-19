import type { Server } from 'node:http';
import type { Express } from 'express';
import type { OrderServiceConfiguration } from './configuration.js';

export type ShutdownSignal = 'SIGINT' | 'SIGTERM';

export interface OrderServerLogEntry {
  readonly level: 'error' | 'info';
  readonly message: string;
  readonly [key: string]: unknown;
}

export interface OrderServerLogSink {
  write(entry: OrderServerLogEntry): void;
}

const consoleLogSink: OrderServerLogSink = {
  write: (entry) => {
    const serializedEntry = JSON.stringify(entry);
    if (entry.level === 'error') {
      console.error(serializedEntry);
      return;
    }

    console.log(serializedEntry);
  },
};

export const createGracefulShutdownHandler = (
  server: Pick<Server, 'close'>,
  logSink: OrderServerLogSink = consoleLogSink,
  markFailure: () => void = () => {
    process.exitCode = 1;
  },
): ((signal: ShutdownSignal) => void) => {
  let shutdownStarted = false;

  return (signal) => {
    if (shutdownStarted) {
      return;
    }
    shutdownStarted = true;

    logSink.write({
      level: 'info',
      message: 'Order service shutdown started',
      signal,
    });

    server.close((error) => {
      if (error !== undefined) {
        logSink.write({
          level: 'error',
          message: 'Order service shutdown failed',
          signal,
        });
        markFailure();
        return;
      }

      logSink.write({
        level: 'info',
        message: 'Order service stopped',
        signal,
      });
    });
  };
};

export const startOrderHttpServer = (
  app: Express,
  configuration: OrderServiceConfiguration,
  startupMessage: string,
  logSink: OrderServerLogSink = consoleLogSink,
): Server => {
  const server = app.listen(configuration.port, configuration.host, () => {
    logSink.write({
      level: 'info',
      message: startupMessage,
      host: configuration.host,
      port: configuration.port,
    });
  });
  const shutdown = createGracefulShutdownHandler(server, logSink);

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  return server;
};
