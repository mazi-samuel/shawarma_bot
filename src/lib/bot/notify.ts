import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, customers, orderItems, menuItems } from "@/lib/db/schema";
import { sendText } from "@/lib/whatsapp/client";
import type { Vendor } from "@/lib/vendor/vendor";
import { formatMoney, formatEta } from "@/lib/bot/messages";

async function getOrderWithCustomer(orderId: number) {
  const rows = await db
    .select({ order: orders, customer: customers })
    .from(orders)
    .innerJoin(customers, eq(orders.customerId, customers.id))
    .where(eq(orders.id, orderId))
    .limit(1);
  return rows[0];
}

function creds(vendor: Vendor) {
  if (!vendor.whatsappPhoneNumberId || !vendor.whatsappToken) return null;
  return { phoneNumberId: vendor.whatsappPhoneNumberId, token: vendor.whatsappToken };
}

export async function notifyCustomerOrderPaid(vendor: Vendor, orderId: number): Promise<void> {
  const row = await getOrderWithCustomer(orderId);
  const credentials = creds(vendor);
  if (!row || !credentials) return;

  const eta = row.order.estimatedReadyAt
    ? formatEta(Math.ceil((row.order.estimatedReadyAt.getTime() - Date.now()) / 60000))
    : "shortly";

  await sendText(
    credentials,
    row.customer.phoneNumber,
    `Payment received for order #${orderId}! ✅ Total: ${formatMoney(row.order.totalKobo, vendor.currency)}.\nWe're getting started — ready in about ${eta}. We'll message you again when it's ready for pickup.`
  );
}

export async function notifyCustomerStatusChange(
  vendor: Vendor,
  orderId: number,
  status: "preparing" | "ready" | "completed"
): Promise<void> {
  const row = await getOrderWithCustomer(orderId);
  const credentials = creds(vendor);
  if (!row || !credentials) return;

  const copy: Record<string, string> = {
    preparing: `Your order #${orderId} is now being prepared. 👨‍🍳`,
    ready: `Order #${orderId} is ready for pickup! 🎉 Come on by.`,
    completed: `Order #${orderId} marked complete. Thanks for ordering — hope you enjoyed it! 🌯`,
  };

  await sendText(credentials, row.customer.phoneNumber, copy[status]!);
}

/** Pings the vendor's own admin number — the same number that manages orders/menu/FAQs by chatting with the bot. */
export async function notifyVendorNewOrder(vendor: Vendor, orderId: number): Promise<void> {
  const credentials = creds(vendor);
  if (!credentials) return;

  const row = await getOrderWithCustomer(orderId);
  if (!row) return;

  const items = await db
    .select({ quantity: orderItems.quantity, name: menuItems.name })
    .from(orderItems)
    .innerJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
    .where(eq(orderItems.orderId, orderId));

  const lines = items.map((i) => `${i.quantity}x ${i.name}`).join(", ");

  await sendText(
    credentials,
    vendor.adminPhone,
    `🔔 New paid order #${orderId} from ${row.customer.name ?? row.customer.phoneNumber}\n${lines}\nTotal: ${formatMoney(row.order.totalKobo, vendor.currency)}\n\nType "menu" here to open your admin menu and update its status.`
  );
}
