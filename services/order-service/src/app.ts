import { createApp } from './composition/create-app.js';
import { createInMemoryDependencies } from './composition/system-dependencies.js';

export const app = createApp(createInMemoryDependencies());
