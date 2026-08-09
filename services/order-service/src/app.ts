import { createApp } from './composition/create-app.js';
import { createSystemDependencies } from './composition/system-dependencies.js';

export const app = createApp(createSystemDependencies());
