import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { vendors } from "@/lib/db/schema";

export type Vendor = typeof vendors.$inferSelect;

export async function getVendorBySlug(slug: string): Promise<Vendor | undefined> {
  const rows = await db.select().from(vendors).where(eq(vendors.slug, slug)).limit(1);
  return rows[0];
}

export async function getVendorById(id: number): Promise<Vendor | undefined> {
  const rows = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
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
  adminPassword: string;
  currency?: string;
  timezone?: string;
  vendorNotifyPhone?: string;
  whatsappPhoneNumberId?: string;
  whatsappToken?: string;
  paystackSecretKey?: string;
}

export async function createVendor(input: CreateVendorInput): Promise<Vendor> {
  const adminPasswordHash = await bcrypt.hash(input.adminPassword, 10);

  const [vendor] = await db
    .insert(vendors)
    .values({
      businessName: input.businessName,
      slug: input.slug,
      adminPasswordHash,
      currency: input.currency ?? "NGN",
      timezone: input.timezone ?? "Africa/Lagos",
      vendorNotifyPhone: input.vendorNotifyPhone,
      whatsappPhoneNumberId: input.whatsappPhoneNumberId || null,
      whatsappToken: input.whatsappToken || null,
      paystackSecretKey: input.paystackSecretKey || null,
    })
    .returning();

  if (!vendor) throw new Error("Failed to create vendor");
  return vendor;
}

export async function verifyVendorPassword(vendor: Vendor, password: string): Promise<boolean> {
  return bcrypt.compare(password, vendor.adminPasswordHash);
}
