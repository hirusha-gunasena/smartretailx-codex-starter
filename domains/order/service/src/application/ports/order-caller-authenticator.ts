export type OrderRole = 'admin' | 'customer';

export interface VerifiedOrderCaller {
  readonly subject: string;
  readonly role: OrderRole;
}

export interface OrderCallerAuthenticator {
  authenticate(authorizationHeader: string | undefined): Promise<VerifiedOrderCaller>;
}
