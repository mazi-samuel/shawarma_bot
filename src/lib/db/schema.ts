import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  varchar,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";

export const menuCategoryValues = ["shawarma", "pastry", "drink"] as const;
export type MenuCategory = (typeof menuCategoryValues)[number];

export const orderStatusValues = [
  "cart",
  "awaiting_payment",
  "paid",
  "preparing",
  "ready",
  "completed",
  "cancelled",
] as const;
export type OrderStatus = (typeof orderStatusValues)[number];

export const conversationStepValues = [
  "idle",
  "main_menu",
  "browsing_category",
  "browsing_item",
  "awaiting_quantity",
  "cart_review",
  "awaiting_payment",
  "faq",
] as const;
export type ConversationStep = (typeof conversationStepValues)[number];

/**
 * One row per shawarma/pastry seller on the platform. Everything else
 * (menu, orders, conversation state, FAQs) is scoped to a vendorId so the
 * same deployment can serve any number of independent sellers.
 *
 * WhatsApp app-level secrets (WHATSAPP_APP_SECRET / WHATSAPP_VERIFY_TOKEN)
 * stay as platform env vars, not per-vendor columns, because they belong to
 * the one shared Meta App the platform operates — every vendor's WhatsApp
 * number is added as a phone number under that single app (the same model
 * WhatsApp BSPs like Twilio/360dialog/Wati use). What IS per-vendor is each
 * vendor's own phone_number_id + access token (for sending) and their own
 * Paystack secret key (so their money settles to their own bank account).
 */
export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 60 }).notNull().unique(),
  businessName: varchar("business_name", { length: 120 }).notNull(),
  adminPasswordHash: text("admin_password_hash").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("NGN"),
  timezone: varchar("timezone", { length: 60 }).notNull().default("Africa/Lagos"),
  whatsappPhoneNumberId: varchar("whatsapp_phone_number_id", { length: 60 }).unique(),
  whatsappToken: text("whatsapp_token"),
  paystackSecretKey: text("paystack_secret_key"),
  vendorNotifyPhone: varchar("vendor_notify_phone", { length: 20 }),
  greetingMessage: text("greeting_message"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const menuItems = pgTable("menu_items", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id")
    .notNull()
    .references(() => vendors.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  category: varchar("category", { length: 20 }).notNull().$type<MenuCategory>(),
  description: text("description").notNull().default(""),
  priceKobo: integer("price_kobo").notNull(),
  prepMinutes: integer("prep_minutes").notNull(),
  imageUrl: text("image_url"),
  isAvailable: boolean("is_available").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
    name: varchar("name", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.vendorId, table.phoneNumber)]
);

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id")
    .notNull()
    .references(() => vendors.id, { onDelete: "cascade" }),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  status: varchar("status", { length: 20 }).notNull().$type<OrderStatus>().default("cart"),
  totalKobo: integer("total_kobo").notNull().default(0),
  paystackReference: varchar("paystack_reference", { length: 100 }),
  estimatedReadyAt: timestamp("estimated_ready_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  menuItemId: integer("menu_item_id")
    .notNull()
    .references(() => menuItems.id),
  quantity: integer("quantity").notNull(),
  unitPriceKobo: integer("unit_price_kobo").notNull(),
});

export const conversationState = pgTable(
  "conversation_state",
  {
    vendorId: integer("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
    step: varchar("step", { length: 30 }).notNull().$type<ConversationStep>().default("idle"),
    context: jsonb("context").notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.vendorId, table.phoneNumber] })]
);

export const faqs = pgTable("faqs", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id")
    .notNull()
    .references(() => vendors.id, { onDelete: "cascade" }),
  keywords: text("keywords").array().notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
});

// Tracks inbound WhatsApp message IDs we've already handled, so Meta's
// at-least-once webhook retries don't double-process an order/payment step.
// Message IDs ("wamid...") are globally unique across all of WhatsApp, so
// this table doesn't need vendor scoping.
export const processedMessages = pgTable("processed_messages", {
  messageId: varchar("message_id", { length: 100 }).primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
