import { readProductionConfiguration } from './composition/configuration.js';
import { createProductionApp } from './composition/production-composition.js';

const configuration = readProductionConfiguration();
const app = createProductionApp(configuration);

app.listen(configuration.port, configuration.host, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Order service started with DynamoDB persistence',
      host: configuration.host,
      port: configuration.port,
    }),
  );
});
