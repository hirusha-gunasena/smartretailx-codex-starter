import { z } from 'zod';

const productNameSchema = z.string().trim().min(1).max(200);
const productDescriptionSchema = z.string().trim().min(1).max(2_000);
const productPriceSchema = z.number().finite().nonnegative();
const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Currency must be a three-letter uppercase code');
const imageUrlSchema = z.string().url();
const timestampSchema = z.string().datetime({ offset: true });

export const productIdSchema = z.string().uuid();

export const productSchema = z
  .object({
    productId: productIdSchema,
    name: productNameSchema,
    description: productDescriptionSchema.optional(),
    price: productPriceSchema,
    currency: currencySchema,
    imageUrl: imageUrlSchema.optional(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export type Product = z.infer<typeof productSchema>;

export const createProductRequestSchema = z
  .object({
    name: productNameSchema,
    description: productDescriptionSchema.optional(),
    price: productPriceSchema,
    currency: currencySchema,
    imageUrl: imageUrlSchema.optional(),
  })
  .strict();

export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;

export const updateProductRequestSchema = z
  .object({
    name: productNameSchema.optional(),
    description: productDescriptionSchema.optional(),
    price: productPriceSchema.optional(),
    currency: currencySchema.optional(),
    imageUrl: imageUrlSchema.optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one product field must be provided',
  });

export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>;

export const orderItemSchema = z
  .object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().finite().nonnegative(),
  })
  .strict();

export type OrderItem = z.infer<typeof orderItemSchema>;
