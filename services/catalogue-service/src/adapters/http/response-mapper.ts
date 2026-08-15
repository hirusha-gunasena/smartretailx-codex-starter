import type { ApiErrorResponse, ApiSuccessResponse } from '@smartretailx/api-contracts';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import {
  CatalogueAuthorizationError,
  ProductConflictError,
  ProductNotFoundError,
  ProductValidationError,
} from '../../domain/errors.js';
import { HttpRequestError } from './request-parser.js';

const JSON_HEADERS = {
  'content-type': 'application/json',
} as const;

export const successResponse = <TData>(
  statusCode: number,
  data: TData,
  requestId: string,
): APIGatewayProxyStructuredResultV2 => {
  const body: ApiSuccessResponse<TData> = {
    success: true,
    data,
    requestId,
  };

  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
};

export const errorResponse = (
  statusCode: number,
  code: string,
  message: string,
  requestId: string,
): APIGatewayProxyStructuredResultV2 => {
  const body: ApiErrorResponse = {
    success: false,
    error: { code, message },
    requestId,
  };

  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
};

export const noContentResponse = (): APIGatewayProxyStructuredResultV2 => ({
  statusCode: 204,
  headers: JSON_HEADERS,
});

export const mapErrorToResponse = (
  error: unknown,
  requestId: string,
): APIGatewayProxyStructuredResultV2 => {
  if (error instanceof CatalogueAuthorizationError) {
    return errorResponse(403, 'FORBIDDEN', 'Access denied.', requestId);
  }

  if (error instanceof HttpRequestError) {
    return errorResponse(error.statusCode, error.code, error.message, requestId);
  }

  if (error instanceof ProductValidationError) {
    return errorResponse(400, 'VALIDATION_ERROR', 'The product request is invalid.', requestId);
  }

  if (error instanceof ProductConflictError) {
    return errorResponse(409, 'PRODUCT_CONFLICT', 'The product already exists.', requestId);
  }

  if (error instanceof ProductNotFoundError) {
    return errorResponse(404, 'PRODUCT_NOT_FOUND', 'The product was not found.', requestId);
  }

  return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred.', requestId);
};
