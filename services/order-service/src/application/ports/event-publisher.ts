/**
 * Future asynchronous publishing boundary. Task 006 deliberately supplies no implementation and
 * invokes no publisher; Task 007 will bind this abstraction to the shared OrderCreated contract.
 */
export interface EventPublisher<TEvent> {
  publish(event: TEvent): Promise<void>;
}
