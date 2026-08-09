/** Application-facing event publication boundary. AWS SDK types remain in adapter code. */
export interface EventPublisher<TEvent> {
  publish(event: TEvent): Promise<void>;
}
