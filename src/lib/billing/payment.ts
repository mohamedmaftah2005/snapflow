import type { BillingProvider, PlanId, SubscriptionStatus } from "@/lib/accounts/types";

export type NormalizedEventType =
  | "subscription.activated"
  | "subscription.updated"
  | "subscription.canceled"
  | "subscription.expired"
  | "payment.failed";

export interface NormalizedPaymentEvent {
  id: string;
  type: NormalizedEventType;
  userId?: string;
  externalCustomerId?: string;
  externalSubscriptionId?: string;
  planId: PlanId;
  status: SubscriptionStatus;
  periodStart?: number;
  periodEnd?: number;
  cancelAtPeriodEnd?: boolean;
}

export interface PaymentDriver {
  readonly id: BillingProvider;
  createCheckout(input: {
    userId: string;
    email: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; externalSessionId?: string }>;
  /** Cancel at period end (never immediate unless provider confirms refund). */
  cancelSubscription(externalSubscriptionId: string): Promise<void>;
  verifyWebhook(rawBody: string, signature: string): Promise<NormalizedPaymentEvent>;
}
