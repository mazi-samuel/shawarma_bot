import crypto from "node:crypto";

export interface IncomingMessage {
  from: string;
  messageId: string;
  contactName?: string;
  /** Normalized user input: typed text, or the id of a selected list row / button. */
  text: string;
  raw: unknown;
}

interface WhatsAppWebhookPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          from: string;
          id: string;
          type: string;
          text?: { body: string };
          interactive?: {
            type: string;
            list_reply?: { id: string; title: string };
            button_reply?: { id: string; title: string };
          };
          button?: { text?: string };
        }>;
      };
    }>;
  }>;
}

/** Verifies the X-Hub-Signature-256 header Meta sends on every webhook POST, using the platform's shared App Secret. */
export function verifySignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader) return false;

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.replace("sha256=", "");

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * A webhook delivery can (in principle) bundle changes for multiple phone
 * numbers. We group parsed messages by the phone_number_id they arrived on
 * so the route can look up the right vendor for each group.
 */
export interface IncomingBatch {
  phoneNumberId: string;
  messages: IncomingMessage[];
}

export function parseIncomingBatches(payload: WhatsAppWebhookPayload): IncomingBatch[] {
  const batches: IncomingBatch[] = [];
  if (payload.object !== "whatsapp_business_account") return batches;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!value?.messages || !phoneNumberId) continue;

      const contactName = value.contacts?.[0]?.profile?.name;
      const messages: IncomingMessage[] = [];

      for (const msg of value.messages) {
        let text = "";
        if (msg.type === "text" && msg.text) {
          text = msg.text.body.trim();
        } else if (msg.type === "interactive" && msg.interactive) {
          text = msg.interactive.list_reply?.id ?? msg.interactive.button_reply?.id ?? "";
        } else if (msg.type === "button" && msg.button) {
          text = msg.button.text ?? "";
        }

        messages.push({
          from: msg.from,
          messageId: msg.id,
          contactName,
          text,
          raw: msg,
        });
      }

      batches.push({ phoneNumberId, messages });
    }
  }

  return batches;
}
