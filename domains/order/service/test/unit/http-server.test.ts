import type { Server } from 'node:http';
import { jest } from '@jest/globals';
import { createGracefulShutdownHandler } from '../../src/index.js';
import type { OrderServerLogEntry, OrderServerLogSink } from '../../src/index.js';

const createLogSink = () => {
  const entries: OrderServerLogEntry[] = [];
  const sink: OrderServerLogSink = {
    write: (entry) => entries.push(entry),
  };

  return { entries, sink };
};

test('graceful shutdown stops accepting connections once and records completion', () => {
  const close = jest.fn<(callback?: (error?: Error) => void) => Server>((callback) => {
    callback?.();
    return server;
  });
  const server = { close } as unknown as Server;
  const { entries, sink } = createLogSink();
  const markFailure = jest.fn();
  const shutdown = createGracefulShutdownHandler(server, sink, markFailure);

  shutdown('SIGTERM');
  shutdown('SIGINT');

  expect(close).toHaveBeenCalledTimes(1);
  expect(markFailure).not.toHaveBeenCalled();
  expect(entries).toEqual([
    {
      level: 'info',
      message: 'Order service shutdown started',
      signal: 'SIGTERM',
    },
    {
      level: 'info',
      message: 'Order service stopped',
      signal: 'SIGTERM',
    },
  ]);
});

test('graceful shutdown records close failures without exposing the error', () => {
  const close = jest.fn<(callback?: (error?: Error) => void) => Server>((callback) => {
    callback?.(new Error('sensitive socket failure'));
    return server;
  });
  const server = { close } as unknown as Server;
  const { entries, sink } = createLogSink();
  const markFailure = jest.fn();
  const shutdown = createGracefulShutdownHandler(server, sink, markFailure);

  shutdown('SIGINT');

  expect(markFailure).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(entries)).not.toContain('sensitive socket failure');
  expect(entries.at(-1)).toEqual({
    level: 'error',
    message: 'Order service shutdown failed',
    signal: 'SIGINT',
  });
});
