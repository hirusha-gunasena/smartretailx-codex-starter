import { createOrderWorkflowHandlerFromEnvironment } from './composition/order-workflow-composition.js';

export const handler = createOrderWorkflowHandlerFromEnvironment();
