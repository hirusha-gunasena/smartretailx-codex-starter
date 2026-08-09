/**
 * Future asynchronous publishing boundary. Task 006 deliberately supplies no implementation and
 * invokes no publisher. Task 007 also leaves this abstraction unimplemented so persistence and
 * reliable event publication remain separate concerns for Task 008.
 */
export interface EventPublisher<TEvent> {
  publish(event: TEvent): Promise<void>;
}
