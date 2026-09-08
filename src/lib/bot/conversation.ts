import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversationState, type ConversationStep } from "@/lib/db/schema";
import type { Vendor } from "@/lib/vendor/vendor";
import type { WhatsAppCredentials } from "@/lib/whatsapp/client";

export function creds(vendor: Vendor): WhatsAppCredentials {
  if (!vendor.whatsappPhoneNumberId || !vendor.whatsappToken) {
    throw new Error(`Vendor ${vendor.slug} has no WhatsApp credentials configured`);
  }
  return { phoneNumberId: vendor.whatsappPhoneNumberId, token: vendor.whatsappToken };
}

export async function getState(vendorId: number, phoneNumber: string) {
  const rows = await db
    .select()
    .from(conversationState)
    .where(and(eq(conversationState.vendorId, vendorId), eq(conversationState.phoneNumber, phoneNumber)))
    .limit(1);
  if (rows[0]) return rows[0];

  const inserted = await db
    .insert(conversationState)
    .values({ vendorId, phoneNumber, step: "idle", context: {} })
    .returning();
  return inserted[0]!;
}

export async function setState(
  vendorId: number,
  phoneNumber: string,
  step: ConversationStep,
  context: object
): Promise<void> {
  await db
    .update(conversationState)
    .set({ step, context, updatedAt: new Date() })
    .where(and(eq(conversationState.vendorId, vendorId), eq(conversationState.phoneNumber, phoneNumber)));
}

export function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

/** Typing any of these, in any flow (customer or admin), jumps back to that flow's main menu. */
export const RESET_KEYWORDS = new Set(["menu", "hi", "hello", "hey", "start", "hey there"]);
