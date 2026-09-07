import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { menuItems, faqs } from "@/lib/db/schema";
import { createVendor, getVendorBySlug, slugify } from "@/lib/vendor/vendor";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

const signupSchema = z.object({
  businessName: z.string().min(2).max(120),
  slug: z.string().min(2).max(60).optional(),
  adminPassword: z.string().min(4).max(200),
  currency: z.string().length(3).optional(),
  vendorNotifyPhone: z.string().max(20).optional(),
});

const STARTER_MENU = [
  { name: "Classic Beef Shawarma", category: "shawarma" as const, description: "Grilled beef, garlic sauce, pickles, toasted wrap.", priceKobo: 250000, prepMinutes: 10 },
  { name: "Chicken Shawarma", category: "shawarma" as const, description: "Marinated grilled chicken, garlic mayo, veggies.", priceKobo: 230000, prepMinutes: 10 },
  { name: "Meat Pie", category: "pastry" as const, description: "Flaky pastry, seasoned minced meat and potatoes.", priceKobo: 80000, prepMinutes: 5 },
  { name: "Bottled Water", category: "drink" as const, description: "50cl bottled water.", priceKobo: 30000, prepMinutes: 1 },
];

const STARTER_FAQS = [
  { keywords: ["hour", "open", "close", "time"], question: "What are your opening hours?", answer: "We're open every day from 10am to 9pm." },
  { keywords: ["pay", "payment", "card", "transfer"], question: "How do I pay?", answer: "After you build your order, we'll send you a secure payment link — pay by card, bank transfer, or USSD." },
  { keywords: ["cancel", "refund"], question: "Can I cancel my order?", answer: 'You can cancel any time before payment by typing "cancel". Once paid, please contact us directly for refund requests.' },
];

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const baseSlug = slugify(parsed.data.slug || parsed.data.businessName);
  if (!baseSlug) {
    return NextResponse.json({ error: "Could not derive a valid slug from that business name" }, { status: 400 });
  }

  let slug = baseSlug;
  let suffix = 1;
  while (await getVendorBySlug(slug)) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  const vendor = await createVendor({
    businessName: parsed.data.businessName,
    slug,
    adminPassword: parsed.data.adminPassword,
    currency: parsed.data.currency,
    vendorNotifyPhone: parsed.data.vendorNotifyPhone,
  });

  // Give every new vendor a small starter menu + FAQ set so their admin
  // dashboard isn't empty on day one — easy to edit or delete from there.
  await db.insert(menuItems).values(STARTER_MENU.map((item) => ({ ...item, vendorId: vendor.id })));
  await db.insert(faqs).values(STARTER_FAQS.map((faq) => ({ ...faq, vendorId: vendor.id })));

  const res = NextResponse.json({
    slug: vendor.slug,
    paystackWebhookUrl: `${process.env.SITE_URL ?? ""}/api/webhook/paystack/${vendor.slug}`,
  });
  res.cookies.set(SESSION_COOKIE_NAME, createSessionToken(vendor.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
