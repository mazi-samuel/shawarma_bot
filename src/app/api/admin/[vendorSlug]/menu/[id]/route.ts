import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { menuItems, menuCategoryValues } from "@/lib/db/schema";
import { requireVendor } from "@/lib/auth/require-vendor";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  category: z.enum(menuCategoryValues).optional(),
  description: z.string().max(500).optional(),
  priceKobo: z.number().int().positive().optional(),
  prepMinutes: z.number().int().positive().optional(),
  imageUrl: z.string().url().optional().nullable(),
  isAvailable: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ vendorSlug: string; id: string }> }
) {
  const { vendorSlug, id } = await params;
  const auth = await requireVendor(req, vendorSlug);
  if ("response" in auth) return auth.response;
  const { vendor } = auth;

  const itemId = Number(id);
  if (!Number.isFinite(itemId)) {
    return NextResponse.json({ error: "Invalid item id" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [updated] = await db
    .update(menuItems)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(menuItems.id, itemId), eq(menuItems.vendorId, vendor.id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ vendorSlug: string; id: string }> }
) {
  const { vendorSlug, id } = await params;
  const auth = await requireVendor(req, vendorSlug);
  if ("response" in auth) return auth.response;
  const { vendor } = auth;

  const itemId = Number(id);
  if (!Number.isFinite(itemId)) {
    return NextResponse.json({ error: "Invalid item id" }, { status: 400 });
  }

  await db.delete(menuItems).where(and(eq(menuItems.id, itemId), eq(menuItems.vendorId, vendor.id)));
  return NextResponse.json({ deleted: true });
}
