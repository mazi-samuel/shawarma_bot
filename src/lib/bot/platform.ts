import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { platformState } from "@/lib/db/schema";
import {
  createVendor,
  getVendorByAdminPhone,
  getVendorBySlug,
  linkVendorWhatsapp,
  listVendors,
  slugify,
} from "@/lib/vendor/vendor";
import { sendText, sendInteractiveList, type WhatsAppCredentials } from "@/lib/whatsapp/client";
import type { IncomingMessage } from "@/lib/whatsapp/webhook-handler";

const CURRENCIES = ["NGN", "GHS", "KES", "ZAR", "USD"] as const;

interface PlatformContext {
  businessName?: string;
}

function platformCreds(): WhatsAppCredentials {
  const phoneNumberId = process.env.PLATFORM_PHONE_NUMBER_ID;
  const token = process.env.PLATFORM_WHATSAPP_TOKEN;
  if (!phoneNumberId || !token) {
    throw new Error("PLATFORM_PHONE_NUMBER_ID / PLATFORM_WHATSAPP_TOKEN are not set");
  }
  return { phoneNumberId, token };
}

async function getPlatformState(phoneNumber: string) {
  const rows = await db.select().from(platformState).where(eq(platformState.phoneNumber, phoneNumber)).limit(1);
  if (rows[0]) return rows[0];
  const inserted = await db
    .insert(platformState)
    .values({ phoneNumber, step: "idle", context: {} })
    .returning();
  return inserted[0]!;
}

async function setPlatformState(phoneNumber: string, step: string, context: PlatformContext): Promise<void> {
  await db
    .update(platformState)
    .set({ step, context, updatedAt: new Date() })
    .where(eq(platformState.phoneNumber, phoneNumber));
}

export async function handlePlatformMessage(msg: IncomingMessage): Promise<void> {
  const phone = msg.from;
  const text = msg.text.trim();
  const creds = platformCreds();

  if (phone === process.env.OPERATOR_PHONE_NUMBER) {
    await handleOperatorCommand(creds, phone, text);
    return;
  }

  const existingVendor = await getVendorByAdminPhone(phone);
  if (existingVendor) {
    if (existingVendor.whatsappPhoneNumberId) {
      await sendText(
        creds,
        phone,
        `Your bot for "${existingVendor.businessName}" is already live — message your own business WhatsApp number directly to manage orders, menu, FAQs, and settings.`
      );
    } else {
      await sendText(
        creds,
        phone,
        `You're already registered as "${existingVendor.businessName}" (slug: ${existingVendor.slug}). We're still waiting on your WhatsApp number to be linked — we'll message you here the moment it's ready.`
      );
    }
    return;
  }

  const state = await getPlatformState(phone);
  const context = (state.context ?? {}) as PlatformContext;
  const lower = text.toLowerCase();

  if (state.step === "idle" || lower === "hi" || lower === "hello" || lower === "start") {
    await setPlatformState(phone, "awaiting_business_name", {});
    await sendText(
      creds,
      phone,
      `Welcome! Let's get your shawarma/pastry bot set up. What's your business name?`
    );
    return;
  }

  switch (state.step) {
    case "awaiting_business_name": {
      if (!text) {
        await sendText(creds, phone, "Please send your business name.");
        return;
      }
      await setPlatformState(phone, "awaiting_currency", { businessName: text });
      await sendInteractiveList(creds, phone, {
        bodyText: `Got it — "${text}". What currency do you sell in?`,
        buttonLabel: "Choose",
        sections: [
          {
            title: "Currency",
            rows: CURRENCIES.map((c) => ({ id: `curr_${c}`, title: c })),
          },
        ],
      });
      return;
    }

    case "awaiting_currency": {
      const match = /^curr_([A-Z]{3})$/.exec(text);
      if (!match) {
        await sendText(creds, phone, "Please pick a currency from the list.");
        return;
      }
      const businessName = context.businessName;
      if (!businessName) {
        await setPlatformState(phone, "awaiting_business_name", {});
        await sendText(creds, phone, "Something went wrong — what's your business name?");
        return;
      }

      let slug = slugify(businessName);
      let suffix = 1;
      while (await getVendorBySlug(slug)) {
        suffix += 1;
        slug = `${slugify(businessName)}-${suffix}`;
      }

      const vendor = await createVendor({
        businessName,
        slug,
        adminPhone: phone,
        currency: match[1],
      });

      await setPlatformState(phone, "registered", {});
      await sendText(
        creds,
        phone,
        `🎉 You're registered! Your slug is "${vendor.slug}".\n\nOne more step, on our side: we'll add a WhatsApp number for your business to our system and link it to your account. We'll message you here the moment it's ready — then that number is yours to give to customers, and this same chat (from this phone) becomes your admin console.`
      );

      const operatorPhone = process.env.OPERATOR_PHONE_NUMBER;
      if (operatorPhone) {
        await sendText(
          creds,
          operatorPhone,
          `🆕 New vendor signup: "${vendor.businessName}" (slug: ${vendor.slug}, currency: ${vendor.currency}, admin: ${phone}).\nAdd their number in Meta, then send:\nlink ${vendor.slug} <phone_number_id> <token>`
        );
      }
      return;
    }

    default: {
      await sendText(creds, phone, `You're all set — we'll message you here once your bot is linked.`);
      return;
    }
  }
}

async function handleOperatorCommand(
  creds: WhatsAppCredentials,
  operatorPhone: string,
  text: string
): Promise<void> {
  const parts = text.trim().split(/\s+/);
  const command = parts[0]?.toLowerCase();

  if (command === "link" && parts.length === 4) {
    const [, slug, phoneNumberId, token] = parts;
    const vendor = await getVendorBySlug(slug!);
    if (!vendor) {
      await sendText(creds, operatorPhone, `No vendor with slug "${slug}".`);
      return;
    }
    const updated = await linkVendorWhatsapp(slug!, phoneNumberId!, token!);
    if (!updated) {
      await sendText(creds, operatorPhone, `Failed to link "${slug}".`);
      return;
    }
    await sendText(
      creds,
      operatorPhone,
      `✅ Linked "${updated.businessName}" (${slug}) to phone_number_id ${phoneNumberId}.`
    );

    // Let the vendor know their bot is live, sent from THEIR OWN newly-linked number.
    try {
      await sendText(
        { phoneNumberId: phoneNumberId!, token: token! },
        updated.adminPhone,
        `🎉 Your Shawarma Bot for "${updated.businessName}" is live! This number is now your customer-facing WhatsApp number. Message it from this same phone any time to manage orders, menu, FAQs, and settings — type "menu" to see your admin options.${updated.paystackSecretKey ? "" : "\n\n⚠️ You still need to set your Paystack key before customers can pay — type \"menu\" → Settings → Set Paystack key."}`
      );
    } catch (err) {
      console.error("Failed to notify newly-linked vendor", err);
      await sendText(
        creds,
        operatorPhone,
        `(Linked OK, but couldn't message the vendor to confirm — check the token is correct.)`
      );
    }
    return;
  }

  if (command === "vendors") {
    const all = await listVendors();
    if (all.length === 0) {
      await sendText(creds, operatorPhone, "No vendors registered yet.");
      return;
    }
    const lines = all
      .map((v) => `• ${v.businessName} (${v.slug}) — ${v.whatsappPhoneNumberId ? "linked ✅" : "pending link ⏳"}`)
      .join("\n");
    await sendText(creds, operatorPhone, lines);
    return;
  }

  await sendText(
    creds,
    operatorPhone,
    `Commands:\nlink <slug> <phone_number_id> <token> — link a registered vendor's WhatsApp number\nvendors — list all vendors and their link status`
  );
}
