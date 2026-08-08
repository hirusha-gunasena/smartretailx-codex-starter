import {
  createProductRequestSchema,
  productSchema,
  updateProductRequestSchema,
} from '@smartretailx/api-contracts';
import type {
  CreateProductRequest,
  Product,
  UpdateProductRequest,
} from '@smartretailx/api-contracts';
import { ProductValidationError } from './errors.js';

const toValidationError = (issues: readonly { path: readonly PropertyKey[]; message: string }[]) =>
  new ProductValidationError(
    issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  );

const parseProduct = (value: unknown): Product => {
  const result = productSchema.safeParse(value);

  if (!result.success) {
    throw toValidationError(result.error.issues);
  }

  return result.data;
};

const parseCreateRequest = (value: CreateProductRequest): CreateProductRequest => {
  const result = createProductRequestSchema.safeParse(value);

  if (!result.success) {
    throw toValidationError(result.error.issues);
  }

  return result.data;
};

const parseUpdateRequest = (value: UpdateProductRequest): UpdateProductRequest => {
  const result = updateProductRequestSchema.safeParse(value);

  if (!result.success) {
    throw toValidationError(result.error.issues);
  }

  return result.data;
};

const nextUpdateTimestamp = (currentTimestamp: string, candidateTimestamp: string): string => {
  const currentTime = Date.parse(currentTimestamp);
  const candidateTime = Date.parse(candidateTimestamp);

  if (!Number.isFinite(candidateTime) || candidateTime > currentTime) {
    return candidateTimestamp;
  }

  return new Date(currentTime + 1).toISOString();
};

export class ProductEntity {
  private readonly state: Readonly<Product>;

  private constructor(product: Product) {
    this.state = Object.freeze({ ...product });
  }

  public static create(
    request: CreateProductRequest,
    productId: string,
    timestamp: string,
  ): ProductEntity {
    const input = parseCreateRequest(request);
    const product = parseProduct({
      productId,
      name: input.name,
      price: input.price,
      currency: input.currency,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.imageUrl === undefined ? {} : { imageUrl: input.imageUrl }),
    });

    return new ProductEntity(product);
  }

  public static rehydrate(product: Product): ProductEntity {
    return new ProductEntity(parseProduct(product));
  }

  public update(request: UpdateProductRequest, timestamp: string): ProductEntity {
    const input = parseUpdateRequest(request);
    const product = parseProduct({
      productId: this.state.productId,
      name: input.name ?? this.state.name,
      price: input.price ?? this.state.price,
      currency: input.currency ?? this.state.currency,
      createdAt: this.state.createdAt,
      updatedAt: nextUpdateTimestamp(this.state.updatedAt, timestamp),
      ...(input.description !== undefined
        ? { description: input.description }
        : this.state.description === undefined
          ? {}
          : { description: this.state.description }),
      ...(input.imageUrl !== undefined
        ? { imageUrl: input.imageUrl }
        : this.state.imageUrl === undefined
          ? {}
          : { imageUrl: this.state.imageUrl }),
    });

    return new ProductEntity(product);
  }

  public snapshot(): Product {
    return { ...this.state };
  }
}
