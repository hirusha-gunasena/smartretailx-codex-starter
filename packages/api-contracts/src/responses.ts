import { z } from 'zod';

const requestIdSchema = z.string().trim().min(1);

export interface ApiSuccessResponse<TData> {
  readonly success: true;
  readonly data: TData;
  readonly requestId: string;
}

export const createApiSuccessResponseSchema = <TDataSchema extends z.ZodType>(
  dataSchema: TDataSchema,
) =>
  z
    .object({
      success: z.literal(true),
      data: dataSchema,
      requestId: requestIdSchema,
    })
    .strict();

export const apiSuccessResponseSchema = createApiSuccessResponseSchema(z.unknown());

export const apiErrorResponseSchema = z
  .object({
    success: z.literal(false),
    error: z
      .object({
        code: z.string().trim().min(1),
        message: z.string().trim().min(1),
        details: z.unknown().optional(),
      })
      .strict(),
    requestId: requestIdSchema,
  })
  .strict();

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
