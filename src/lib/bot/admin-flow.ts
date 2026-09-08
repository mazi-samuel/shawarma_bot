import { eq, and, inArray, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, orderItems, menuItems, type MenuCategory } from "@/lib/db/schema";
import type { Vendor } from "@/lib/vendor/vendor";
import { updateVendorSettings } from "@/lib/vendor/vendor";
import { sendText, sendInteractiveList, sendInteractiveButtons } from "@/lib/whatsapp/client";
import {
  CATEGORY_LABELS,
  getAllMenuItems,
  getMenuItemById,
  createMenuItem,
  setMenuItemAvailability,
  deleteMenuItem,
} from "@/lib/bot/menu-flow";
import { getAllFaqs, getFaqById, createFaq, deleteFaq } from "@/lib/bot/faq";
import { notifyCustomerStatusChange } from "@/lib/bot/notify";
import { formatMoney, formatEta } from "@/lib/bot/messages";
import { creds, getState, setState, truncate, RESET_KEYWORDS } from "@/lib/bot/conversation";
import type { IncomingMessage } from "@/lib/whatsapp/webhook-handler";

interface AdminContext {
  pendingOrderId?: number;
  pendingItemId?: number;
  pendingFaqId?: number;
  newItem?: { name?: string; category?: MenuCategory; priceKobo?: number };
  newFaq?: { question?: string; answer?: string };
}

const ACTIVE_ORDER_STATUSES = ["awaiting_payment", "paid", "preparing", "ready"] as const;

const NEXT_STATUS: Record<string, { label: string; next: "preparing" | "ready" | "completed" } | undefined> = {
  paid: { label: "Mark preparing", next: "preparing" },
  preparing: { label: "Mark ready", next: "ready" },
  ready: { label: "Mark completed", next: "completed" },
};

const CURRENCIES = ["NGN", "GHS", "KES", "ZAR", "USD"] as const;

export async function handleAdminMessage(vendor: Vendor, msg: IncomingMessage): Promise<void> {
  const phone = vendor.adminPhone;
  const text = msg.text.trim();
  const lower = text.toLowerCase();

  const state = await getState(vendor.id, phone);
  const context = (state.context ?? {}) as AdminContext;

  if (RESET_KEYWORDS.has(lower)) {
    await setState(vendor.id, phone, "admin_main_menu", {});
    await sendAdminMainMenu(vendor);
    return;
  }

  switch (state.step) {
    case "idle":
    case "admin_main_menu": {
      if (state.step === "idle") {
        await setState(vendor.id, phone, "admin_main_menu", {});
        await sendAdminMainMenu(vendor);
        return;
      }
      if (text === "orders") {
        await setState(vendor.id, phone, "admin_orders_list", {});
        await sendOrdersList(vendor);
      } else if (text === "menu_items") {
        await setState(vendor.id, phone, "admin_menu_list", {});
        await sendMenuList(vendor);
      } else if (text === "faqs") {
        await setState(vendor.id, phone, "admin_faq_list", {});
        await sendFaqList(vendor);
      } else if (text === "settings") {
        await setState(vendor.id, phone, "admin_settings_menu", {});
        await sendSettingsMenu(vendor);
      } else {
        await sendAdminMainMenu(vendor);
      }
      return;
    }

    case "admin_orders_list": {
      const orderId = Number(text.replace("order_", ""));
      if (text.startsWith("order_") && Number.isFinite(orderId)) {
        await setState(vendor.id, phone, "admin_order_detail", { pendingOrderId: orderId });
        await sendOrderDetail(vendor, orderId);
      } else {
        await sendOrdersList(vendor);
      }
      return;
    }

    case "admin_order_detail": {
      const orderId = context.pendingOrderId;
      if (!orderId) {
        await setState(vendor.id, phone, "admin_orders_list", {});
        await sendOrdersList(vendor);
        return;
      }
      if (text === "back") {
        await setState(vendor.id, phone, "admin_orders_list", {});
        await sendOrdersList(vendor);
        return;
      }
      if (text === "advance") {
        const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
        const action = order ? NEXT_STATUS[order.status] : undefined;
        if (order && action) {
          await db
            .update(orders)
            .set({ status: action.next, updatedAt: new Date() })
            .where(and(eq(orders.id, orderId), eq(orders.vendorId, vendor.id)));
          await notifyCustomerStatusChange(vendor, orderId, action.next);
          await sendText(creds(vendor), phone, `Order #${orderId} marked ${action.next}.`);
        }
        await sendOrderDetail(vendor, orderId);
        return;
      }
      await sendOrderDetail(vendor, orderId);
      return;
    }

    case "admin_menu_list": {
      if (text === "add_item") {
        await setState(vendor.id, phone, "admin_adding_item_name", {});
        await sendText(creds(vendor), phone, `What's the new item's name?`);
      } else if (text.startsWith("item_")) {
        const itemId = Number(text.slice(5));
        await setState(vendor.id, phone, "admin_item_detail", { pendingItemId: itemId });
        await sendItemDetail(vendor, itemId);
      } else {
        await sendMenuList(vendor);
      }
      return;
    }

    case "admin_adding_item_name": {
      if (!text) {
        await sendText(creds(vendor), phone, "Please send a name for the item.");
        return;
      }
      await setState(vendor.id, phone, "admin_adding_item_category", { newItem: { name: text } });
      await sendInteractiveButtons(creds(vendor), phone, `Category for "${text}"?`, [
        { id: "cat_shawarma", title: "Shawarma" },
        { id: "cat_pastry", title: "Pastry" },
        { id: "cat_drink", title: "Drink" },
      ]);
      return;
    }

    case "admin_adding_item_category": {
      const match = /^cat_(shawarma|pastry|drink)$/.exec(text);
      if (!match) {
        await sendText(creds(vendor), phone, "Please tap one of the category buttons.");
        return;
      }
      const category = match[1] as MenuCategory;
      await setState(vendor.id, phone, "admin_adding_item_price", {
        newItem: { ...context.newItem, category },
      });
      await sendText(
        creds(vendor),
        phone,
        `What's the price in ${vendor.currency}? (e.g. 2500 or 2500.50, no symbol)`
      );
      return;
    }

    case "admin_adding_item_price": {
      const price = Number.parseFloat(text);
      if (!Number.isFinite(price) || price <= 0) {
        await sendText(creds(vendor), phone, "Please send a valid price, e.g. 2500.");
        return;
      }
      await setState(vendor.id, phone, "admin_adding_item_prep", {
        newItem: { ...context.newItem, priceKobo: Math.round(price * 100) },
      });
      await sendText(creds(vendor), phone, "How many minutes does it usually take to prepare?");
      return;
    }

    case "admin_adding_item_prep": {
      const prep = Number.parseInt(text, 10);
      if (!Number.isFinite(prep) || prep <= 0) {
        await sendText(creds(vendor), phone, "Please send a whole number of minutes, e.g. 10.");
        return;
      }
      const draft = context.newItem;
      if (!draft?.name || !draft.category || !draft.priceKobo) {
        await setState(vendor.id, phone, "admin_menu_list", {});
        await sendText(creds(vendor), phone, "Something went wrong — let's start over.");
        await sendMenuList(vendor);
        return;
      }
      const created = await createMenuItem(vendor.id, {
        name: draft.name,
        category: draft.category,
        priceKobo: draft.priceKobo,
        prepMinutes: prep,
      });
      await setState(vendor.id, phone, "admin_menu_list", {});
      await sendText(
        creds(vendor),
        phone,
        `✅ Added "${created!.name}" — ${formatMoney(created!.priceKobo, vendor.currency)}, ready in ~${formatEta(created!.prepMinutes)}.`
      );
      await sendMenuList(vendor);
      return;
    }

    case "admin_item_detail": {
      const itemId = context.pendingItemId;
      if (!itemId) {
        await setState(vendor.id, phone, "admin_menu_list", {});
        await sendMenuList(vendor);
        return;
      }
      if (text === "back") {
        await setState(vendor.id, phone, "admin_menu_list", {});
        await sendMenuList(vendor);
        return;
      }
      if (text === "toggle_avail") {
        const item = await getMenuItemById(vendor.id, itemId);
        if (item) {
          await setMenuItemAvailability(vendor.id, itemId, !item.isAvailable);
          await sendText(
            creds(vendor),
            phone,
            `"${item.name}" is now ${!item.isAvailable ? "available" : "hidden"}.`
          );
        }
        await sendItemDetail(vendor, itemId);
        return;
      }
      if (text === "delete_item") {
        const item = await getMenuItemById(vendor.id, itemId);
        await deleteMenuItem(vendor.id, itemId);
        await sendText(creds(vendor), phone, `🗑️ Deleted "${item?.name ?? "item"}".`);
        await setState(vendor.id, phone, "admin_menu_list", {});
        await sendMenuList(vendor);
        return;
      }
      await sendItemDetail(vendor, itemId);
      return;
    }

    case "admin_faq_list": {
      if (text === "add_faq") {
        await setState(vendor.id, phone, "admin_adding_faq_question", {});
        await sendText(creds(vendor), phone, "What question should this FAQ answer? (shown as a topic hint to customers)");
      } else if (text.startsWith("faq_")) {
        const faqId = Number(text.slice(4));
        await setState(vendor.id, phone, "admin_faq_detail", { pendingFaqId: faqId });
        await sendFaqDetail(vendor, faqId);
      } else {
        await sendFaqList(vendor);
      }
      return;
    }

    case "admin_adding_faq_question": {
      if (!text) {
        await sendText(creds(vendor), phone, "Please send the question text.");
        return;
      }
      await setState(vendor.id, phone, "admin_adding_faq_answer", { newFaq: { question: text } });
      await sendText(creds(vendor), phone, "And what's the answer?");
      return;
    }

    case "admin_adding_faq_answer": {
      if (!text) {
        await sendText(creds(vendor), phone, "Please send the answer text.");
        return;
      }
      await setState(vendor.id, phone, "admin_adding_faq_keywords", {
        newFaq: { ...context.newFaq, answer: text },
      });
      await sendText(
        creds(vendor),
        phone,
        `Last step — what keywords should trigger this answer? Comma-separated, e.g: hours, open, close`
      );
      return;
    }

    case "admin_adding_faq_keywords": {
      const keywords = text
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      if (keywords.length === 0) {
        await sendText(creds(vendor), phone, "Please send at least one keyword, comma-separated.");
        return;
      }
      const draft = context.newFaq;
      if (!draft?.question || !draft.answer) {
        await setState(vendor.id, phone, "admin_faq_list", {});
        await sendText(creds(vendor), phone, "Something went wrong — let's start over.");
        await sendFaqList(vendor);
        return;
      }
      await createFaq(vendor.id, { question: draft.question, answer: draft.answer, keywords });
      await setState(vendor.id, phone, "admin_faq_list", {});
      await sendText(creds(vendor), phone, `✅ Added FAQ: "${draft.question}"`);
      await sendFaqList(vendor);
      return;
    }

    case "admin_faq_detail": {
      const faqId = context.pendingFaqId;
      if (!faqId) {
        await setState(vendor.id, phone, "admin_faq_list", {});
        await sendFaqList(vendor);
        return;
      }
      if (text === "delete_faq") {
        const faq = await getFaqById(vendor.id, faqId);
        await deleteFaq(vendor.id, faqId);
        await sendText(creds(vendor), phone, `🗑️ Deleted FAQ: "${faq?.question ?? ""}"`);
        await setState(vendor.id, phone, "admin_faq_list", {});
        await sendFaqList(vendor);
        return;
      }
      await setState(vendor.id, phone, "admin_faq_list", {});
      await sendFaqList(vendor);
      return;
    }

    case "admin_settings_menu": {
      if (text === "set_paystack") {
        await setState(vendor.id, phone, "admin_awaiting_paystack_key", {});
        await sendText(
          creds(vendor),
          phone,
          "Send your Paystack secret key (starts with sk_). This is only visible to you in this chat."
        );
      } else if (text === "set_greeting") {
        await setState(vendor.id, phone, "admin_awaiting_greeting", {});
        await sendText(
          creds(vendor),
          phone,
          `Send the new greeting message, or send "default" to go back to the standard one.`
        );
      } else if (text === "set_currency") {
        await setState(vendor.id, phone, "admin_awaiting_currency", {});
        await sendInteractiveList(creds(vendor), phone, {
          bodyText: "Pick a currency:",
          buttonLabel: "Choose",
          sections: [
            {
              title: "Currency",
              rows: CURRENCIES.map((c) => ({ id: `curr_${c}`, title: c })),
            },
          ],
        });
      } else {
        await sendSettingsMenu(vendor);
      }
      return;
    }

    case "admin_awaiting_paystack_key": {
      if (!text.startsWith("sk_") && !text.startsWith("demo")) {
        await sendText(
          creds(vendor),
          phone,
          `That doesn't look like a Paystack secret key (should start with "sk_"). Send it again, or type "menu" to cancel.`
        );
        return;
      }
      const updatedAfterPaystack = (await updateVendorSettings(vendor.id, { paystackSecretKey: text })) ?? vendor;
      await setState(vendor.id, phone, "admin_settings_menu", {});
      await sendText(creds(vendor), phone, "✅ Paystack key saved. Customers can now check out.");
      await sendSettingsMenu(updatedAfterPaystack);
      return;
    }

    case "admin_awaiting_greeting": {
      const value = lower === "default" ? null : text;
      const updatedAfterGreeting = (await updateVendorSettings(vendor.id, { greetingMessage: value })) ?? vendor;
      await setState(vendor.id, phone, "admin_settings_menu", {});
      await sendText(creds(vendor), phone, value ? "✅ Greeting updated." : "✅ Reverted to the default greeting.");
      await sendSettingsMenu(updatedAfterGreeting);
      return;
    }

    case "admin_awaiting_currency": {
      const match = /^curr_([A-Z]{3})$/.exec(text);
      if (!match || !CURRENCIES.includes(match[1] as (typeof CURRENCIES)[number])) {
        await sendText(creds(vendor), phone, "Please pick a currency from the list.");
        return;
      }
      const updatedAfterCurrency = (await updateVendorSettings(vendor.id, { currency: match[1] })) ?? vendor;
      await setState(vendor.id, phone, "admin_settings_menu", {});
      await sendText(creds(vendor), phone, `✅ Currency set to ${match[1]}.`);
      await sendSettingsMenu(updatedAfterCurrency);
      return;
    }

    default: {
      await setState(vendor.id, phone, "admin_main_menu", {});
      await sendAdminMainMenu(vendor);
      return;
    }
  }
}

async function sendAdminMainMenu(vendor: Vendor): Promise<void> {
  await sendInteractiveList(creds(vendor), vendor.adminPhone, {
    headerText: `${vendor.businessName} — Admin`,
    bodyText: "What would you like to manage?",
    buttonLabel: "Choose an option",
    sections: [
      {
        title: "Admin menu",
        rows: [
          { id: "orders", title: "📦 Orders", description: "View and update order status" },
          { id: "menu_items", title: "🌯 Menu", description: "Add, hide, or delete items" },
          { id: "faqs", title: "❓ FAQs", description: "Manage what the bot answers" },
          { id: "settings", title: "⚙️ Settings", description: "Payments, greeting, currency" },
        ],
      },
    ],
  });
}

async function sendOrdersList(vendor: Vendor): Promise<void> {
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.vendorId, vendor.id), inArray(orders.status, [...ACTIVE_ORDER_STATUSES])))
    .orderBy(desc(orders.createdAt))
    .limit(10);

  if (rows.length === 0) {
    await sendText(creds(vendor), vendor.adminPhone, "No active orders right now.");
    await sendAdminMainMenu(vendor);
    return;
  }

  await sendInteractiveList(creds(vendor), vendor.adminPhone, {
    bodyText: "Active orders:",
    buttonLabel: "Pick an order",
    sections: [
      {
        title: "Orders",
        rows: rows.map((o) => ({
          id: `order_${o.id}`,
          title: `Order #${o.id}`,
          description: truncate(`${o.status} · ${formatMoney(o.totalKobo, vendor.currency)}`, 72),
        })),
      },
    ],
  });
}

async function sendOrderDetail(vendor: Vendor, orderId: number): Promise<void> {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.vendorId, vendor.id)))
    .limit(1);

  if (!order) {
    await sendText(creds(vendor), vendor.adminPhone, "That order wasn't found.");
    await sendOrdersList(vendor);
    return;
  }

  const items = await db
    .select({ quantity: orderItems.quantity, name: menuItems.name, unitPriceKobo: orderItems.unitPriceKobo })
    .from(orderItems)
    .innerJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
    .where(eq(orderItems.orderId, orderId));

  const lines = items.map((i) => `${i.quantity}x ${i.name} — ${formatMoney(i.unitPriceKobo * i.quantity, vendor.currency)}`).join("\n");
  const action = NEXT_STATUS[order.status];

  const body = `Order #${order.id} — ${order.status}\n${lines}\nTotal: ${formatMoney(order.totalKobo, vendor.currency)}`;

  const buttons = [{ id: "back", title: "⬅️ Back" }];
  if (action) buttons.unshift({ id: "advance", title: action.label });

  await sendInteractiveButtons(creds(vendor), vendor.adminPhone, body, buttons);
}

async function sendMenuList(vendor: Vendor): Promise<void> {
  const items = await getAllMenuItems(vendor.id);

  const rows = [
    { id: "add_item", title: "➕ Add new item" },
    ...items.slice(0, 9).map((item) => ({
      id: `item_${item.id}`,
      title: truncate(item.name, 24),
      description: truncate(
        `${formatMoney(item.priceKobo, vendor.currency)} · ${CATEGORY_LABELS[item.category]} · ${item.isAvailable ? "Available" : "Hidden"}`,
        72
      ),
    })),
  ];

  await sendInteractiveList(creds(vendor), vendor.adminPhone, {
    bodyText: items.length === 0 ? "Your menu is empty. Add your first item!" : "Your menu:",
    buttonLabel: "Manage",
    sections: [{ title: "Menu", rows }],
  });
}

async function sendItemDetail(vendor: Vendor, itemId: number): Promise<void> {
  const item = await getMenuItemById(vendor.id, itemId);
  if (!item) {
    await sendText(creds(vendor), vendor.adminPhone, "That item wasn't found.");
    await sendMenuList(vendor);
    return;
  }

  await sendInteractiveButtons(
    creds(vendor),
    vendor.adminPhone,
    `${item.name}\n${formatMoney(item.priceKobo, vendor.currency)} · ${CATEGORY_LABELS[item.category]} · ready in ~${formatEta(item.prepMinutes)}\nStatus: ${item.isAvailable ? "Available" : "Hidden"}`,
    [
      { id: "toggle_avail", title: item.isAvailable ? "Hide" : "Unhide" },
      { id: "delete_item", title: "🗑️ Delete" },
      { id: "back", title: "⬅️ Back" },
    ]
  );
}

async function sendFaqList(vendor: Vendor): Promise<void> {
  const list = await getAllFaqs(vendor.id);

  const rows = [
    { id: "add_faq", title: "➕ Add new FAQ" },
    ...list.slice(0, 9).map((faq) => ({
      id: `faq_${faq.id}`,
      title: truncate(faq.question, 24),
      description: truncate(faq.answer, 72),
    })),
  ];

  await sendInteractiveList(creds(vendor), vendor.adminPhone, {
    bodyText: list.length === 0 ? "No FAQs yet. Add your first one!" : "Your FAQs:",
    buttonLabel: "Manage",
    sections: [{ title: "FAQs", rows }],
  });
}

async function sendFaqDetail(vendor: Vendor, faqId: number): Promise<void> {
  const faq = await getFaqById(vendor.id, faqId);
  if (!faq) {
    await sendText(creds(vendor), vendor.adminPhone, "That FAQ wasn't found.");
    await sendFaqList(vendor);
    return;
  }

  await sendInteractiveButtons(
    creds(vendor),
    vendor.adminPhone,
    `Q: ${faq.question}\nA: ${faq.answer}\nKeywords: ${faq.keywords.join(", ")}`,
    [
      { id: "delete_faq", title: "🗑️ Delete" },
      { id: "back", title: "⬅️ Back" },
    ]
  );
}

async function sendSettingsMenu(vendor: Vendor): Promise<void> {
  const summary = [
    `Business: ${vendor.businessName}`,
    `Currency: ${vendor.currency}`,
    `Paystack: ${vendor.paystackSecretKey ? "✅ configured" : "❌ not set — customers can't check out yet"}`,
    `Greeting: ${vendor.greetingMessage ? "custom" : "default"}`,
  ].join("\n");

  await sendInteractiveList(creds(vendor), vendor.adminPhone, {
    bodyText: summary,
    buttonLabel: "Choose",
    sections: [
      {
        title: "Settings",
        rows: [
          { id: "set_paystack", title: "💳 Set Paystack key" },
          { id: "set_greeting", title: "💬 Set greeting" },
          { id: "set_currency", title: "💱 Change currency" },
        ],
      },
    ],
  });
}

