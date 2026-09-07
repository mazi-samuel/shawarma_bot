import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, orderStatusValues, type OrderStatus } from "@/lib/db/schema";
import { notifyCustomerStatusChange } from "@/lib/bot/notify";
import { requireVendor } from "@/lib/auth/require-vendor";

const NOTIFIABLE_STATUSES = new Set(["preparing", "ready", "completed"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ vendorSlug: string; id: string }> }
) {
  const { vendorSlug, id } = await params;
  const auth = await requireVendor(req, vendorSlug);
  if ("response" in auth) return auth.response;
  const { vendor } = auth;

  const orderId = Number(id);
  if (!Number.isFinite(orderId)) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const body = await req.json();
  const status = body.status as OrderStatus;
  if (!orderStatusValues.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const [updated] = await db
    .update(orders)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.vendorId, vendor.id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (NOTIFIABLE_STATUSES.has(status)) {
    await notifyCustomerStatusChange(vendor, orderId, status as "preparing" | "ready" | "completed");
  }

  return NextResponse.json(updated);
}
