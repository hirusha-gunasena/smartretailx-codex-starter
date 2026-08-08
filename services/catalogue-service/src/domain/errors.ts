export interface ProductValidationIssue {
  readonly path: string;
  readonly message: string;
}

export abstract class CatalogueError extends Error {
  protected constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ProductValidationError extends CatalogueError {
  public constructor(public readonly issues: readonly ProductValidationIssue[]) {
    super('Product validation failed', 'PRODUCT_VALIDATION_FAILED');
  }
}

export class ProductNotFoundError extends CatalogueError {
  public constructor(public readonly productId: string) {
    super(`Product '${productId}' was not found`, 'PRODUCT_NOT_FOUND');
  }
}

export class ProductConflictError extends CatalogueError {
  public constructor(public readonly productId: string) {
    super(`Product '${productId}' already exists`, 'PRODUCT_CONFLICT');
  }
}
