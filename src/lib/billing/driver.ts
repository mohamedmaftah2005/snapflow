import { env } from "@/lib/config/env";
import type { PaymentDriver } from "./payment";
import { StripePaymentDriver } from "./stripe";
import { TestPaymentDriver } from "./test-driver";

export function getPaymentDriver(): PaymentDriver {
  if (env.billingProvider === "stripe") return new StripePaymentDriver();
  if (env.billingProvider === "test") return new TestPaymentDriver();
  throw new Error("BILLING_PROVIDER must be 'stripe' or 'test'");
}

export function billingEnabled(): boolean {
  return env.billingProvider === "stripe" || env.billingProvider === "test";
}
