import { NextRequest, NextResponse } from "next/server";
import { eq, desc, ne, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, customers, orderItems, menuItems } from "@/lib/db/schema";
import { requireVendor } from "@/lib/auth/require-vendor";

export async function GET(req: NextRequest, { params }: { params: Promise<{ vendorSlug: string }> }) {
  const { vendorSlug } = await params;
  const auth = await requireVendor(req, vendorSlug);
  if ("response" in auth) return auth.response;
  const { vendor } = auth;

  const orderRows = await db
    .select({ order: orders, customer: customers })
    .from(orders)
    .innerJoin(customers, eq(orders.customerId, customers.id))
    .where(and(eq(orders.vendorId, vendor.id), ne(orders.status, "cart")))
    .orderBy(desc(orders.createdAt))
    .limit(100);

  const itemRows = await db
    .select({
      orderId: orderItems.orderId,
      quantity: orderItems.quantity,
      unitPriceKobo: orderItems.unitPriceKobo,
      name: menuItems.name,
    })
    .from(orderItems)
    .innerJoin(menuItems, eq(orderItems.menuItemId, menuItems.id));

  const itemsByOrder = new Map<number, typeof itemRows>();
  for (const item of itemRows) {
    const list = itemsByOrder.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrder.set(item.orderId, list);
  }

  const result = orderRows.map((row) => ({
    ...row.order,
    customerName: row.customer.name,
    customerPhone: row.customer.phoneNumber,
    items: itemsByOrder.get(row.order.id) ?? [],
  }));

  return NextResponse.json(result);
}
