import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, menuItems, orderItems, customers, conversationState } from "@/lib/db/schema";
import { verifyPaystackSignature, verifyTransaction } from "@/lib/paystack/client";
import { notifyCustomerOrderPaid, notifyVendorNewOrder } from "@/lib/bot/notify";
import { getVendorBySlug } from "@/lib/vendor/vendor";

// Each vendor configures THIS route's URL (with their own slug) as the
// webhook in their own Paystack dashboard, since Paystack webhook payloads
// don't carry an account identifier — the URL path is what routes it, and
// the signature is verified against that vendor's own secret key.

export async function POST(req: NextRequest, { params }: { params: Promise<{ vendorSlug: string }> }) {
  const { vendorSlug } = await params;
  const vendor = await getVendorBySlug(vendorSlug);
  if (!vendor || !vendor.paystackSecretKey) {
    return new NextResponse("Unknown vendor", { status: 404 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!verifyPaystackSignature(rawBody, signature, vendor.paystackSecretKey)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const event = JSON.parse(rawBody);
  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true });
  }

  const reference: string = event.data.reference;

  // Re-verify server-side rather than trusting the webhook body directly.
  const verified = await verifyTransaction(vendor.paystackSecretKey, reference);
  if (verified.status !== "success") {
    return NextResponse.json({ received: true });
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.paystackReference, reference))
    .limit(1);

  if (!order || order.vendorId !== vendor.id || order.status !== "awaiting_payment") {
    // Already processed, unknown order, wrong vendor, or a duplicate webhook delivery.
    return NextResponse.json({ received: true });
  }

  const lines = await db
    .select({ prepMinutes: menuItems.prepMinutes })
    .from(orderItems)
    .innerJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
    .where(eq(orderItems.orderId, order.id));

  const etaMinutes = lines.reduce((max, l) => Math.max(max, l.prepMinutes), 0);
  const estimatedReadyAt = new Date(Date.now() + etaMinutes * 60_000);

  await db
    .update(orders)
    .set({ status: "paid", estimatedReadyAt, updatedAt: new Date() })
    .where(eq(orders.id, order.id));

  await notifyCustomerOrderPaid(vendor, order.id);
  await notifyVendorNewOrder(vendor, order.id);

  // Free the customer's chat back up now that checkout is done, so the next
  // message they send goes to the main menu instead of a stale "awaiting
  // payment" prompt.
  const [customer] = await db.select().from(customers).where(eq(customers.id, order.customerId)).limit(1);
  if (customer) {
    await db
      .update(conversationState)
      .set({ step: "idle", context: {}, updatedAt: new Date() })
      .where(
        and(eq(conversationState.vendorId, vendor.id), eq(conversationState.phoneNumber, customer.phoneNumber))
      );
  }

  return NextResponse.json({ received: true });
}
