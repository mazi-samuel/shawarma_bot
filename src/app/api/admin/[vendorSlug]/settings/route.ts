import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { vendors } from "@/lib/db/schema";
import { requireVendor } from "@/lib/auth/require-vendor";

const settingsSchema = z.object({
  businessName: z.string().min(1).max(120).optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().min(1).max(60).optional(),
  vendorNotifyPhone: z.string().max(20).optional().nullable(),
  greetingMessage: z.string().max(500).optional().nullable(),
  whatsappPhoneNumberId: z.string().max(60).optional().nullable(),
  whatsappToken: z.string().optional().nullable(),
  paystackSecretKey: z.string().optional().nullable(),
  newPassword: z.string().min(4).max(200).optional(),
});

// Deliberately never returns whatsappToken/paystackSecretKey/adminPasswordHash
// in full — the settings page only needs to know whether each is configured.
function toPublicVendor(vendor: typeof vendors.$inferSelect) {
  return {
    id: vendor.id,
    slug: vendor.slug,
    businessName: vendor.businessName,
    currency: vendor.currency,
    timezone: vendor.timezone,
    vendorNotifyPhone: vendor.vendorNotifyPhone,
    greetingMessage: vendor.greetingMessage,
    isActive: vendor.isActive,
    whatsappConfigured: Boolean(vendor.whatsappPhoneNumberId && vendor.whatsappToken),
    whatsappPhoneNumberId: vendor.whatsappPhoneNumberId,
    paystackConfigured: Boolean(vendor.paystackSecretKey),
    paystackWebhookUrl: `${process.env.SITE_URL ?? ""}/api/webhook/paystack/${vendor.slug}`,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ vendorSlug: string }> }) {
  const { vendorSlug } = await params;
  const auth = await requireVendor(req, vendorSlug);
  if ("response" in auth) return auth.response;
  return NextResponse.json(toPublicVendor(auth.vendor));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ vendorSlug: string }> }) {
  const { vendorSlug } = await params;
  const auth = await requireVendor(req, vendorSlug);
  if ("response" in auth) return auth.response;
  const { vendor } = auth;

  const body = await req.json();
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { newPassword, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest, updatedAt: new Date() };

  // Blank strings from the settings form mean "leave unchanged", not "clear it" —
  // credentials are only ever overwritten when a real value is submitted.
  for (const key of ["whatsappPhoneNumberId", "whatsappToken", "paystackSecretKey"] as const) {
    if (updates[key] === "") delete updates[key];
  }

  if (newPassword) {
    updates.adminPasswordHash = await bcrypt.hash(newPassword, 10);
  }

  const [updated] = await db
    .update(vendors)
    .set(updates)
    .where(eq(vendors.id, vendor.id))
    .returning();

  return NextResponse.json(toPublicVendor(updated!));
}
