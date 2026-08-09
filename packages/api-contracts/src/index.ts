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
  confirmedOrderSchema,
  createOrderRequestSchema,
  customerIdSchema,
  orderIdSchema,
  orderSchema,
  orderStatusSchema,
  pendingOrderSchema,
  rejectedOrderSchema,
} from './order.js';
export type {
  ConfirmedOrder,
  CreateOrderRequest,
  Order,
  OrderStatus,
  PendingOrder,
  RejectedOrder,
} from './order.js';

export {
  apiErrorResponseSchema,
  apiSuccessResponseSchema,
  createApiSuccessResponseSchema,
} from './responses.js';
export type { ApiErrorResponse, ApiSuccessResponse } from './responses.js';
