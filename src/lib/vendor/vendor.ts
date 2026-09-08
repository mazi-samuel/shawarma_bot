import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { vendors } from "@/lib/db/schema";

export type Vendor = typeof vendors.$inferSelect;

export async function getVendorBySlug(slug: string): Promise<Vendor | undefined> {
  const rows = await db.select().from(vendors).where(eq(vendors.slug, slug)).limit(1);
  return rows[0];
}

export async function getVendorByAdminPhone(adminPhone: string): Promise<Vendor | undefined> {
  const rows = await db.select().from(vendors).where(eq(vendors.adminPhone, adminPhone)).limit(1);
  return rows[0];
}

export async function getVendorByWhatsappPhoneNumberId(
  phoneNumberId: string
): Promise<Vendor | undefined> {
  const rows = await db
    .select()
    .from(vendors)
    .where(eq(vendors.whatsappPhoneNumberId, phoneNumberId))
    .limit(1);
  return rows[0];
}

export async function listVendors(): Promise<Vendor[]> {
  return db.select().from(vendors);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export interface CreateVendorInput {
  businessName: string;
  slug: string;
  adminPhone: string;
  currency?: string;
}

/** Creates a vendor with no WhatsApp number yet — see linkVendorWhatsapp. */
export async function createVendor(input: CreateVendorInput): Promise<Vendor> {
  const [vendor] = await db
    .insert(vendors)
    .values({
      businessName: input.businessName,
      slug: input.slug,
      adminPhone: input.adminPhone,
      currency: input.currency ?? "NGN",
    })
    .returning();

  if (!vendor) throw new Error("Failed to create vendor");
  return vendor;
}

/**
 * Called from the operator's "link" command once they've manually added the
 * vendor's phone number to the platform's Meta App and have a
 * phone_number_id + access token for it. This is the one step in the whole
 * system that requires a human to have visited Meta's own console first —
 * unavoidable, since Meta has no WhatsApp-message API for provisioning a
 * new number.
 */
export async function linkVendorWhatsapp(
  slug: string,
  phoneNumberId: string,
  token: string
): Promise<Vendor | undefined> {
  const [updated] = await db
    .update(vendors)
    .set({ whatsappPhoneNumberId: phoneNumberId, whatsappToken: token, updatedAt: new Date() })
    .where(eq(vendors.slug, slug))
    .returning();
  return updated;
}

export async function updateVendorSettings(
  vendorId: number,
  patch: Partial<
    Pick<Vendor, "paystackSecretKey" | "greetingMessage" | "currency" | "businessName" | "isActive">
  >
): Promise<Vendor | undefined> {
  const [updated] = await db
    .update(vendors)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(vendors.id, vendorId))
    .returning();
  return updated;
}
