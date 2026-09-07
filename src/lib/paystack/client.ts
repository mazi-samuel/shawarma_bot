import crypto from "node:crypto";

// Overridable so local/CI testing can point this at a mock server instead of
// the real Paystack API — never set in production.
const PAYSTACK_BASE_URL = process.env.PAYSTACK_BASE_URL ?? "https://api.paystack.co";

export interface InitializeTransactionResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

/**
 * Starts a Paystack checkout. WhatsApp customers rarely have an email on hand,
 * so we synthesize one from their phone number — Paystack only needs a
 * validly-formatted email to initialize a transaction, it isn't verified.
 */
export async function initializeTransaction(opts: {
  secretKey: string;
  phoneNumber: string;
  amountKobo: number;
  orderId: number;
  currency: string;
  callbackUrl?: string;
}): Promise<InitializeTransactionResult> {
  const reference = `order_${opts.orderId}_${Date.now()}`;
  const syntheticEmail = `${opts.phoneNumber.replace(/[^0-9]/g, "")}@shawarmabot.customer`;

  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: syntheticEmail,
      amount: opts.amountKobo,
      currency: opts.currency,
      reference,
      metadata: { orderId: opts.orderId, phoneNumber: opts.phoneNumber },
      callback_url: opts.callbackUrl,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Paystack initialize error (${res.status}): ${errText}`);
  }

  const json = await res.json();
  if (!json.status) {
    throw new Error(`Paystack initialize failed: ${json.message}`);
  }

  return {
    authorizationUrl: json.data.authorization_url,
    accessCode: json.data.access_code,
    reference: json.data.reference,
  };
}

export interface VerifyTransactionResult {
  status: "success" | "failed" | "abandoned" | string;
  reference: string;
  amountKobo: number;
  metadata: Record<string, unknown> | null;
}

export async function verifyTransaction(
  secretKey: string,
  reference: string
): Promise<VerifyTransactionResult> {
  const res = await fetch(
    `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Paystack verify error (${res.status}): ${errText}`);
  }

  const json = await res.json();
  return {
    status: json.data.status,
    reference: json.data.reference,
    amountKobo: json.data.amount,
    metadata: json.data.metadata ?? null,
  };
}

/** Verifies the x-paystack-signature header (HMAC-SHA512 of the raw body) using this vendor's own secret key. */
export function verifyPaystackSignature(
  rawBody: string,
  signatureHeader: string | null,
  secretKey: string
): boolean {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac("sha512", secretKey).update(rawBody).digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(signatureHeader, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}
