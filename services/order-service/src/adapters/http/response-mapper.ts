import { randomUUID } from 'node:crypto';
import type { ApiErrorResponse, ApiSuccessResponse } from '@smartretailx/api-contracts';
import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import {
  OrderConflictError,
  OrderNotFoundError,
  OrderValidationError,
} from '../../domain/errors.js';
import { HttpRequestError } from './request-parser.js';

const requestIdFor = (request: Request): string => {
  const requestId = request.header('x-request-id')?.trim();
  return requestId === undefined || requestId.length === 0 ? randomUUID() : requestId;
};

const sendJson = (
  response: Response,
  statusCode: number,
  body: unknown,
  requestId: string,
): void => {
  response.setHeader('x-request-id', requestId);
  response.status(statusCode).json(body);
};

export const sendSuccess = <TData>(
  request: Request,
  response: Response,
  statusCode: number,
  data: TData,
): void => {
  const requestId = requestIdFor(request);
  const body: ApiSuccessResponse<TData> = {
    success: true,
    data,
    requestId,
  };
  sendJson(response, statusCode, body, requestId);
};

export const sendError = (
  request: Request,
  response: Response,
  statusCode: number,
  code: string,
  message: string,
): void => {
  const requestId = requestIdFor(request);
  const body: ApiErrorResponse = {
    success: false,
    error: { code, message },
    requestId,
  };
  sendJson(response, statusCode, body, requestId);
};

const errorType = (error: unknown): unknown =>
  typeof error === 'object' && error !== null && 'type' in error ? error.type : undefined;

export const routeNotFound: RequestHandler = (request, response) => {
  sendError(request, response, 404, 'ROUTE_NOT_FOUND', 'Route not found.');
};

export const errorBoundary: ErrorRequestHandler = (error, request, response, next) => {
  void next;

  if (error instanceof HttpRequestError) {
    sendError(request, response, error.statusCode, error.code, error.message);
    return;
  }

  if (error instanceof OrderValidationError) {
    sendError(request, response, 400, 'VALIDATION_ERROR', 'The order request is invalid.');
    return;
  }

  if (error instanceof OrderNotFoundError) {
    sendError(request, response, 404, 'ORDER_NOT_FOUND', 'The order was not found.');
    return;
  }

  if (error instanceof OrderConflictError) {
    sendError(request, response, 409, 'ORDER_CONFLICT', 'The order already exists.');
    return;
  }

  if (errorType(error) === 'entity.parse.failed') {
    sendError(request, response, 400, 'INVALID_JSON', 'Request body must contain valid JSON.');
    return;
  }

  if (errorType(error) === 'entity.too.large') {
    sendError(request, response, 413, 'PAYLOAD_TOO_LARGE', 'The request payload is too large.');
    return;
  }

  sendError(request, response, 500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred.');
};
