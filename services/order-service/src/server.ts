import { app } from './app.js';
import { readConfiguration } from './composition/configuration.js';

const configuration = readConfiguration();

app.listen(configuration.port, configuration.host, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Order service started',
      host: configuration.host,
      port: configuration.port,
    }),
  );
});
