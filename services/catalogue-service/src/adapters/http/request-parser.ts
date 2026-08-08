import {
  createProductRequestSchema,
  productIdSchema,
  updateProductRequestSchema,
} from '@smartretailx/api-contracts';
import type { CreateProductRequest, UpdateProductRequest } from '@smartretailx/api-contracts';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

export class HttpRequestError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

const parseJsonBody = (event: APIGatewayProxyEventV2): unknown => {
  if (event.body === undefined || event.body.trim().length === 0) {
    throw new HttpRequestError('INVALID_JSON', 'Request body must contain valid JSON.');
  }

  try {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    return JSON.parse(body) as unknown;
  } catch {
    throw new HttpRequestError('INVALID_JSON', 'Request body must contain valid JSON.');
  }
};

export const parseCreateProductRequest = (event: APIGatewayProxyEventV2): CreateProductRequest => {
  const result = createProductRequestSchema.safeParse(parseJsonBody(event));

  if (!result.success) {
    throw new HttpRequestError('VALIDATION_ERROR', 'The product request is invalid.');
  }

  return result.data;
};

export const parseUpdateProductRequest = (event: APIGatewayProxyEventV2): UpdateProductRequest => {
  const result = updateProductRequestSchema.safeParse(parseJsonBody(event));

  if (!result.success) {
    throw new HttpRequestError('VALIDATION_ERROR', 'The product update is invalid.');
  }

  return result.data;
};

export const parseProductId = (event: APIGatewayProxyEventV2): string => {
  const pathValue = event.pathParameters?.productId ?? event.rawPath.split('/').at(-1);
  let productId: string | undefined;

  try {
    productId = pathValue === undefined ? undefined : decodeURIComponent(pathValue);
  } catch {
    productId = undefined;
  }

  const result = productIdSchema.safeParse(productId);

  if (!result.success) {
    throw new HttpRequestError(
      'VALIDATION_ERROR',
      'The productId path parameter must be a valid UUID.',
    );
  }

  return result.data;
};
