export abstract class InventoryServiceError extends Error {
  protected constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InventoryTransactionLimitError extends InventoryServiceError {
  public constructor(
    public readonly distinctProductCount: number,
    public readonly maximumDistinctProducts: number,
  ) {
    super(
      `An inventory reservation contains ${distinctProductCount} distinct products; the maximum is ${maximumDistinctProducts}.`,
      'INVENTORY_TRANSACTION_LIMIT_EXCEEDED',
    );
  }
}

export class InventoryQuantityOverflowError extends InventoryServiceError {
  public constructor(public readonly productId: string) {
    super(
      `The aggregated inventory quantity for product '${productId}' is not a safe integer.`,
      'INVENTORY_QUANTITY_OVERFLOW',
    );
  }
}
