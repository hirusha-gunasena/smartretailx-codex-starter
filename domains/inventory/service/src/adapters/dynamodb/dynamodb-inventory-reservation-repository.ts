import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import type { CancellationReason } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient, TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import type {
  InventoryReservationRepository,
  InventoryReservationResult,
  ReserveInventoryRequest,
} from '../../application/ports/inventory-reservation-repository.js';
import {
  INVENTORY_REJECTION_REASON,
  INVENTORY_RESERVATION_OUTCOME,
  copyInventoryReservation,
  inventoryReservationSchema,
} from '../../domain/inventory-reservation.js';
import type {
  InsufficientInventoryItem,
  InventoryReservation,
} from '../../domain/inventory-reservation.js';

const CONDITIONAL_CHECK_FAILED = 'ConditionalCheckFailed';
const NO_CANCELLATION = 'None';

const hasNoFailure = (reason: CancellationReason | undefined): boolean =>
  reason?.Code === undefined || reason.Code === NO_CANCELLATION;

const isConditionalCheckFailure = (reason: CancellationReason | undefined): boolean =>
  reason?.Code === CONDITIONAL_CHECK_FAILED;

const availableQuantityFrom = (reason: CancellationReason | undefined): number => {
  const encodedQuantity = reason?.Item?.availableQuantity?.N;
  if (encodedQuantity === undefined) {
    return 0;
  }

  const availableQuantity = Number(encodedQuantity);
  if (!Number.isSafeInteger(availableQuantity) || availableQuantity < 0) {
    throw new Error('DynamoDB returned an invalid availableQuantity cancellation value.');
  }

  return availableQuantity;
};

const isExpectedStockCancellation = (
  reasons: readonly CancellationReason[],
  itemCount: number,
): boolean =>
  reasons.every((reason, index) => {
    if (index < itemCount) {
      return hasNoFailure(reason) || isConditionalCheckFailure(reason);
    }

    return hasNoFailure(reason);
  });

export class DynamoDBInventoryReservationRepository implements InventoryReservationRepository {
  public constructor(
    private readonly documentClient: DynamoDBDocumentClient,
    private readonly inventoryTableName: string,
    private readonly reservationsTableName: string,
  ) {
    if (inventoryTableName.trim().length === 0) {
      throw new Error('A non-empty DynamoDB inventory table name is required.');
    }
    if (reservationsTableName.trim().length === 0) {
      throw new Error('A non-empty DynamoDB inventory reservations table name is required.');
    }
  }

  public async reserve(request: ReserveInventoryRequest): Promise<InventoryReservationResult> {
    const existingReservation = await this.findReservation(request.eventId);
    if (existingReservation !== null) {
      return this.existingResult(existingReservation);
    }

    const reserved = inventoryReservationSchema.parse({
      eventId: request.eventId,
      orderId: request.orderId,
      correlationId: request.correlationId,
      outcome: INVENTORY_RESERVATION_OUTCOME.RESERVED,
      items: request.items.map((item) => ({ ...item })),
      processedAt: request.processedAt,
    });

    try {
      await this.documentClient.send(
        new TransactWriteCommand({
          ClientRequestToken: request.eventId,
          TransactItems: this.createReservationTransaction(request, reserved),
        }),
      );

      return { reservation: copyInventoryReservation(reserved), idempotent: false };
    } catch (error) {
      if (!(error instanceof TransactionCanceledException)) {
        throw error;
      }

      return this.handleCancelledReservation(request, error);
    }
  }

  private createReservationTransaction(
    request: ReserveInventoryRequest,
    reserved: InventoryReservation,
  ): NonNullable<TransactWriteCommandInput['TransactItems']> {
    return [
      ...request.items.map((item) => ({
        Update: {
          TableName: this.inventoryTableName,
          Key: { productId: item.productId },
          UpdateExpression:
            'SET #availableQuantity = #availableQuantity - :quantity, #updatedAt = :updatedAt',
          ConditionExpression:
            'attribute_exists(#productId) AND attribute_exists(#availableQuantity) AND #availableQuantity >= :quantity',
          ExpressionAttributeNames: {
            '#productId': 'productId',
            '#availableQuantity': 'availableQuantity',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':quantity': item.quantity,
            ':updatedAt': request.processedAt,
          },
          ReturnValuesOnConditionCheckFailure: 'ALL_OLD' as const,
        },
      })),
      {
        Put: {
          TableName: this.reservationsTableName,
          Item: copyInventoryReservation(reserved),
          ConditionExpression: 'attribute_not_exists(eventId)',
        },
      },
    ];
  }

  private async handleCancelledReservation(
    request: ReserveInventoryRequest,
    error: TransactionCanceledException,
  ): Promise<InventoryReservationResult> {
    const reasons = error.CancellationReasons;
    if (reasons === undefined || reasons.length !== request.items.length + 1) {
      throw error;
    }

    const reservationReason = reasons[request.items.length];
    if (isConditionalCheckFailure(reservationReason)) {
      const existingReservation = await this.findReservation(request.eventId);
      if (existingReservation !== null) {
        return this.existingResult(existingReservation);
      }

      throw error;
    }

    const insufficientItems: InsufficientInventoryItem[] = [];
    for (const [index, item] of request.items.entries()) {
      if (isConditionalCheckFailure(reasons[index])) {
        insufficientItems.push({
          productId: item.productId,
          requestedQuantity: item.quantity,
          availableQuantity: availableQuantityFrom(reasons[index]),
        });
      }
    }

    if (
      insufficientItems.length === 0 ||
      !isExpectedStockCancellation(reasons, request.items.length)
    ) {
      throw error;
    }

    return this.persistRejectedReservation(request, insufficientItems);
  }

  private async persistRejectedReservation(
    request: ReserveInventoryRequest,
    insufficientItems: readonly InsufficientInventoryItem[],
  ): Promise<InventoryReservationResult> {
    const rejected = inventoryReservationSchema.parse({
      eventId: request.eventId,
      orderId: request.orderId,
      correlationId: request.correlationId,
      outcome: INVENTORY_RESERVATION_OUTCOME.REJECTED,
      reason: INVENTORY_REJECTION_REASON.INSUFFICIENT_STOCK,
      items: request.items.map((item) => ({ ...item })),
      insufficientItems: insufficientItems.map((item) => ({ ...item })),
      processedAt: request.processedAt,
    });

    try {
      await this.documentClient.send(
        new PutCommand({
          TableName: this.reservationsTableName,
          Item: copyInventoryReservation(rejected),
          ConditionExpression: 'attribute_not_exists(eventId)',
        }),
      );

      return { reservation: copyInventoryReservation(rejected), idempotent: false };
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) {
        throw error;
      }

      const existingReservation = await this.findReservation(request.eventId);
      if (existingReservation !== null) {
        return this.existingResult(existingReservation);
      }

      throw error;
    }
  }

  private async findReservation(eventId: string): Promise<InventoryReservation | null> {
    const output = await this.documentClient.send(
      new GetCommand({
        TableName: this.reservationsTableName,
        Key: { eventId },
        ConsistentRead: true,
      }),
    );

    if (output.Item === undefined) {
      return null;
    }

    return copyInventoryReservation(inventoryReservationSchema.parse(output.Item));
  }

  private existingResult(reservation: InventoryReservation): InventoryReservationResult {
    return {
      reservation: copyInventoryReservation(reservation),
      idempotent: true,
    };
  }
}
