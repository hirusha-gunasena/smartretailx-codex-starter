import { readConfiguration } from '../../src/index.js';

describe('readConfiguration', () => {
  test('defaults to port 3000 and all network interfaces', () => {
    expect(readConfiguration({})).toEqual({ host: '0.0.0.0', port: 3000 });
  });

  test('reads a configured port', () => {
    expect(readConfiguration({ PORT: ' 8080 ' })).toEqual({ host: '0.0.0.0', port: 8080 });
  });

  test.each(['', '0', '65536', '3000.5', 'not-a-port'])('rejects invalid PORT %p', (port) => {
    expect(() => readConfiguration({ PORT: port })).toThrow();
  });
});
