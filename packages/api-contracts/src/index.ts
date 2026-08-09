export {
  createProductRequestSchema,
  currencySchema,
  orderItemSchema,
  productIdSchema,
  productSchema,
  timestampSchema,
  updateProductRequestSchema,
} from './product.js';
export type { CreateProductRequest, OrderItem, Product, UpdateProductRequest } from './product.js';

export {
  createOrderRequestSchema,
  customerIdSchema,
  orderIdSchema,
  orderSchema,
  orderStatusSchema,
} from './order.js';
export type { CreateOrderRequest, Order, OrderStatus } from './order.js';

export {
  apiErrorResponseSchema,
  apiSuccessResponseSchema,
  createApiSuccessResponseSchema,
} from './responses.js';
export type { ApiErrorResponse, ApiSuccessResponse } from './responses.js';
