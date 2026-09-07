import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { menuItems, menuCategoryValues } from "@/lib/db/schema";
import { requireVendor } from "@/lib/auth/require-vendor";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.enum(menuCategoryValues),
  description: z.string().max(500).optional().default(""),
  priceKobo: z.number().int().positive(),
  prepMinutes: z.number().int().positive(),
  imageUrl: z.string().url().optional().nullable(),
  isAvailable: z.boolean().optional().default(true),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ vendorSlug: string }> }) {
  const { vendorSlug } = await params;
  const auth = await requireVendor(req, vendorSlug);
  if ("response" in auth) return auth.response;
  const { vendor } = auth;

  const rows = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.vendorId, vendor.id))
    .orderBy(menuItems.category, menuItems.name);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ vendorSlug: string }> }) {
  const { vendorSlug } = await params;
  const auth = await requireVendor(req, vendorSlug);
  if ("response" in auth) return auth.response;
  const { vendor } = auth;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [created] = await db
    .insert(menuItems)
    .values({ ...parsed.data, vendorId: vendor.id })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
