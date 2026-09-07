import { eq, and, ne, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  customers,
  conversationState,
  orders,
  orderItems,
  type ConversationStep,
} from "@/lib/db/schema";
import type { Vendor } from "@/lib/vendor/vendor";
import {
  sendText,
  sendInteractiveList,
  sendInteractiveButtons,
  type WhatsAppCredentials,
} from "@/lib/whatsapp/client";
import {
  CATEGORY_LABELS,
  getAvailableCategories,
  getItemsForCategory,
  getMenuItemById,
  computeCartTotalKobo,
  computeEtaMinutes,
  type CartLine,
} from "@/lib/bot/menu-flow";
import { matchFaq, listFaqTopics } from "@/lib/bot/faq";
import { initializeTransaction } from "@/lib/paystack/client";
import {
  greeting,
  FALLBACK,
  HUMAN_HANDOFF,
  ORDER_CANCELLED,
  NO_ACTIVE_ORDER,
  formatMoney,
  formatEta,
} from "@/lib/bot/messages";
import type { IncomingMessage } from "@/lib/whatsapp/webhook-handler";

interface ConversationContext {
  cart?: CartLine[];
  selectedCategory?: string;
  pendingMenuItemId?: number;
  pendingOrderId?: number;
}

const RESET_KEYWORDS = new Set(["menu", "hi", "hello", "hey", "start", "hey there"]);

function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function creds(vendor: Vendor): WhatsAppCredentials {
  if (!vendor.whatsappPhoneNumberId || !vendor.whatsappToken) {
    throw new Error(`Vendor ${vendor.slug} has no WhatsApp credentials configured`);
  }
  return { phoneNumberId: vendor.whatsappPhoneNumberId, token: vendor.whatsappToken };
}

async function getOrCreateCustomer(vendorId: number, phoneNumber: string, name?: string) {
  const existing = await db
    .select()
    .from(customers)
    .where(and(eq(customers.vendorId, vendorId), eq(customers.phoneNumber, phoneNumber)))
    .limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db.insert(customers).values({ vendorId, phoneNumber, name }).returning();
  return inserted[0]!;
}

async function getState(vendorId: number, phoneNumber: string) {
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

async function setState(
  vendorId: number,
  phoneNumber: string,
  step: ConversationStep,
  context: ConversationContext
): Promise<void> {
  await db
    .update(conversationState)
    .set({ step, context, updatedAt: new Date() })
    .where(and(eq(conversationState.vendorId, vendorId), eq(conversationState.phoneNumber, phoneNumber)));
}

async function sendMainMenu(vendor: Vendor, to: string): Promise<void> {
  await sendInteractiveList(creds(vendor), to, {
    bodyText: greeting(vendor.businessName, vendor.greetingMessage),
    buttonLabel: "Choose an option",
    sections: [
      {
        title: "Main menu",
        rows: [
          { id: "order", title: "🌯 Order food", description: "Browse the menu and order" },
          { id: "track", title: "📦 Track my order", description: "Check your order status" },
          { id: "faq", title: "❓ FAQ", description: "Hours, location, and more" },
          { id: "human", title: "🙋 Talk to someone", description: "Chat with our team" },
        ],
      },
    ],
  });
}

async function sendCategoryList(vendor: Vendor, to: string): Promise<void> {
  const categories = await getAvailableCategories(vendor.id);
  if (categories.length === 0) {
    await sendText(creds(vendor), to, "Sorry, the menu is empty right now. Please check back soon!");
    return;
  }
  await sendInteractiveList(creds(vendor), to, {
    bodyText: "What would you like to order from?",
    buttonLabel: "Pick a category",
    sections: [
      {
        title: "Categories",
        rows: categories.map((c) => ({
          id: `cat_${c}`,
          title: CATEGORY_LABELS[c],
        })),
      },
    ],
  });
}

async function sendItemList(vendor: Vendor, to: string, category: string): Promise<void> {
  const items = await getItemsForCategory(vendor.id, category as "shawarma" | "pastry" | "drink");
  if (items.length === 0) {
    await sendText(creds(vendor), to, "No items available in that category right now.");
    return;
  }
  await sendInteractiveList(creds(vendor), to, {
    bodyText: `${CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]} — pick an item:`,
    buttonLabel: "Pick an item",
    sections: [
      {
        title: CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS],
        rows: items.map((item) => ({
          id: `item_${item.id}`,
          title: truncate(item.name, 24),
          description: truncate(
            `${formatMoney(item.priceKobo, vendor.currency)} · ready in ~${formatEta(item.prepMinutes)}`,
            72
          ),
        })),
      },
    ],
  });
}

async function sendCartReview(vendor: Vendor, to: string, cart: CartLine[]): Promise<void> {
  const lines = cart
    .map((l) => `${l.quantity}x ${l.name} — ${formatMoney(l.unitPriceKobo * l.quantity, vendor.currency)}`)
    .join("\n");
  const total = computeCartTotalKobo(cart);
  const eta = computeEtaMinutes(cart);

  await sendInteractiveButtons(
    creds(vendor),
    to,
    `Your cart:\n${lines}\n\nTotal: ${formatMoney(total, vendor.currency)}\nEstimated prep time: ~${formatEta(eta)}`,
    [
      { id: "checkout", title: "✅ Checkout" },
      { id: "add_more", title: "➕ Add more" },
      { id: "cancel_cart", title: "❌ Cancel" },
    ]
  );
}

export async function handleIncomingMessage(vendor: Vendor, msg: IncomingMessage): Promise<void> {
  const phone = msg.from;
  const text = msg.text.trim();
  const lower = text.toLowerCase();

  const customer = await getOrCreateCustomer(vendor.id, phone, msg.contactName);
  const state = await getState(vendor.id, phone);
  const context = (state.context ?? {}) as ConversationContext;

  if (RESET_KEYWORDS.has(lower)) {
    await setState(vendor.id, phone, "main_menu", {});
    await sendMainMenu(vendor, phone);
    return;
  }

  if (lower === "cancel") {
    if (context.pendingOrderId) {
      await db
        .update(orders)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(orders.id, context.pendingOrderId));
    }
    await setState(vendor.id, phone, "main_menu", {});
    await sendText(creds(vendor), phone, ORDER_CANCELLED);
    return;
  }

  switch (state.step) {
    case "idle": {
      await setState(vendor.id, phone, "main_menu", {});
      await sendMainMenu(vendor, phone);
      return;
    }

    case "main_menu": {
      if (text === "order") {
        await setState(vendor.id, phone, "browsing_category", { cart: [] });
        await sendCategoryList(vendor, phone);
      } else if (text === "track") {
        await handleTrackOrder(vendor, phone, customer.id);
      } else if (text === "faq") {
        await setState(vendor.id, phone, "faq", {});
        const topics = await listFaqTopics(vendor.id);
        const topicList = topics.length
          ? `Ask me anything! Some things people ask about:\n${topics.map((t) => `• ${t}`).join("\n")}`
          : "Ask me anything and I'll do my best to help!";
        await sendText(creds(vendor), phone, topicList);
      } else if (text === "human") {
        await sendText(creds(vendor), phone, HUMAN_HANDOFF);
      } else {
        await sendText(creds(vendor), phone, FALLBACK);
        await sendMainMenu(vendor, phone);
      }
      return;
    }

    case "browsing_category": {
      if (text.startsWith("cat_")) {
        const category = text.slice(4);
        await setState(vendor.id, phone, "browsing_item", { ...context, selectedCategory: category });
        await sendItemList(vendor, phone, category);
      } else {
        await sendText(creds(vendor), phone, FALLBACK);
        await sendCategoryList(vendor, phone);
      }
      return;
    }

    case "browsing_item": {
      if (text.startsWith("item_")) {
        const itemId = Number(text.slice(5));
        const item = await getMenuItemById(vendor.id, itemId);
        if (!item) {
          await sendText(creds(vendor), phone, "That item isn't available anymore.");
          await sendCategoryList(vendor, phone);
          await setState(vendor.id, phone, "browsing_category", { ...context, cart: context.cart ?? [] });
          return;
        }
        await setState(vendor.id, phone, "awaiting_quantity", { ...context, pendingMenuItemId: itemId });
        await sendInteractiveButtons(creds(vendor), phone, `How many "${item.name}" would you like?`, [
          { id: "qty_1", title: "1" },
          { id: "qty_2", title: "2" },
          { id: "qty_3", title: "3" },
        ]);
        await sendText(creds(vendor), phone, "(You can also just type a number, e.g. 5)");
      } else {
        await sendText(creds(vendor), phone, FALLBACK);
        await sendCategoryList(vendor, phone);
        await setState(vendor.id, phone, "browsing_category", context);
      }
      return;
    }

    case "awaiting_quantity": {
      const match = /^qty_(\d+)$/.exec(text);
      const quantity = match ? Number(match[1]) : Number.parseInt(text, 10);

      if (!context.pendingMenuItemId || !Number.isFinite(quantity) || quantity <= 0) {
        await sendText(creds(vendor), phone, "Please pick a quantity, or type a number like 2.");
        return;
      }

      const item = await getMenuItemById(vendor.id, context.pendingMenuItemId);
      if (!item) {
        await sendText(creds(vendor), phone, "That item isn't available anymore.");
        await setState(vendor.id, phone, "browsing_category", { cart: context.cart ?? [] });
        await sendCategoryList(vendor, phone);
        return;
      }

      const cart = [...(context.cart ?? [])];
      const existingLine = cart.find((l) => l.menuItemId === item.id);
      if (existingLine) {
        existingLine.quantity += quantity;
      } else {
        cart.push({
          menuItemId: item.id,
          name: item.name,
          unitPriceKobo: item.priceKobo,
          prepMinutes: item.prepMinutes,
          quantity,
        });
      }

      await setState(vendor.id, phone, "cart_review", { cart, selectedCategory: context.selectedCategory });
      await sendCartReview(vendor, phone, cart);
      return;
    }

    case "cart_review": {
      const cart = context.cart ?? [];
      if (text === "add_more") {
        await setState(vendor.id, phone, "browsing_category", { cart });
        await sendCategoryList(vendor, phone);
      } else if (text === "cancel_cart") {
        await setState(vendor.id, phone, "main_menu", {});
        await sendText(creds(vendor), phone, ORDER_CANCELLED);
      } else if (text === "checkout") {
        if (cart.length === 0) {
          await sendText(creds(vendor), phone, "Your cart is empty. Add something first!");
          await setState(vendor.id, phone, "browsing_category", { cart: [] });
          await sendCategoryList(vendor, phone);
          return;
        }
        await checkout(vendor, phone, customer.id, cart);
      } else {
        await sendText(creds(vendor), phone, FALLBACK);
        await sendCartReview(vendor, phone, cart);
      }
      return;
    }

    case "awaiting_payment": {
      await sendText(
        creds(vendor),
        phone,
        `We're waiting for your payment to be confirmed. Tap the payment link we sent, or type "cancel" to cancel this order.`
      );
      return;
    }

    case "faq": {
      const answer = await matchFaq(vendor.id, text);
      if (answer) {
        await sendText(creds(vendor), phone, answer);
      } else {
        await sendText(
          creds(vendor),
          phone,
          `I'm not sure about that one. Type "menu" to see other options, or ask another question.`
        );
      }
      return;
    }

    default: {
      await setState(vendor.id, phone, "main_menu", {});
      await sendMainMenu(vendor, phone);
      return;
    }
  }
}

async function checkout(vendor: Vendor, phone: string, customerId: number, cart: CartLine[]): Promise<void> {
  if (!vendor.paystackSecretKey) {
    await sendText(
      creds(vendor),
      phone,
      "Sorry, this vendor hasn't finished setting up payments yet. Please check back soon!"
    );
    return;
  }

  const totalKobo = computeCartTotalKobo(cart);

  const [order] = await db
    .insert(orders)
    .values({ vendorId: vendor.id, customerId, status: "awaiting_payment", totalKobo })
    .returning();
  if (!order) throw new Error("Failed to create order");

  await db.insert(orderItems).values(
    cart.map((line) => ({
      orderId: order.id,
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      unitPriceKobo: line.unitPriceKobo,
    }))
  );

  const payment = await initializeTransaction({
    secretKey: vendor.paystackSecretKey,
    phoneNumber: phone,
    amountKobo: totalKobo,
    orderId: order.id,
    currency: vendor.currency,
    callbackUrl: process.env.SITE_URL ? `${process.env.SITE_URL}/order-confirmed` : undefined,
  });

  await db
    .update(orders)
    .set({ paystackReference: payment.reference, updatedAt: new Date() })
    .where(eq(orders.id, order.id));

  await setState(vendor.id, phone, "awaiting_payment", { pendingOrderId: order.id });

  await sendText(
    creds(vendor),
    phone,
    `Almost done! Tap below to pay ${formatMoney(totalKobo, vendor.currency)} securely via Paystack:\n${payment.authorizationUrl}\n\nWe'll message you as soon as payment is confirmed.`
  );
}

async function handleTrackOrder(vendor: Vendor, phone: string, customerId: number): Promise<void> {
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.vendorId, vendor.id),
        eq(orders.customerId, customerId),
        ne(orders.status, "cart"),
        ne(orders.status, "cancelled")
      )
    )
    .orderBy(desc(orders.createdAt))
    .limit(1);

  const order = rows[0];
  if (!order) {
    await sendText(creds(vendor), phone, NO_ACTIVE_ORDER);
    return;
  }

  const statusCopy: Record<string, string> = {
    awaiting_payment: "waiting for payment",
    paid: "confirmed, about to start preparing",
    preparing: "being prepared",
    ready: "ready for pickup 🎉",
    completed: "completed — thanks for your order",
  };

  const eta = order.estimatedReadyAt
    ? `\nEstimated ready by: ${order.estimatedReadyAt.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}`
    : "";

  await sendText(
    creds(vendor),
    phone,
    `Order #${order.id} is ${statusCopy[order.status] ?? order.status}.${eta}`
  );
}
