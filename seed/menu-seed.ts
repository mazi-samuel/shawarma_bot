import "./env";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { menuItems, faqs } from "../src/lib/db/schema";
import { createVendor, getVendorBySlug } from "../src/lib/vendor/vendor";

const DEMO_SLUG = "demo-shawarma";

async function main() {
  let vendor = await getVendorBySlug(DEMO_SLUG);
  let vendorAlreadyExisted = false;

  if (vendor) {
    vendorAlreadyExisted = true;
    console.log(`Demo vendor "${DEMO_SLUG}" already exists (id ${vendor.id}) — skipping creation.`);
  } else {
    console.log("Creating demo vendor...");
    vendor = await createVendor({
      businessName: "Mama's Shawarma & Pastries (Demo)",
      slug: DEMO_SLUG,
      adminPassword: process.env.DEMO_ADMIN_PASSWORD ?? "demo1234",
      currency: "NGN",
      vendorNotifyPhone: process.env.VENDOR_PHONE_NUMBER,
      // Demo credentials are intentionally fake — this vendor can be driven
      // end-to-end via simulated webhook payloads (see README) without a
      // real Meta/Paystack account. Swap in real values from /admin/<slug>/settings.
      whatsappPhoneNumberId: "000000000000demo",
      whatsappToken: "demo-token-not-real",
    });
    console.log(`Created demo vendor with id ${vendor.id}, slug "${vendor.slug}".`);
    console.log(`Admin login: /admin/${vendor.slug}/login (password: ${process.env.DEMO_ADMIN_PASSWORD ?? "demo1234"})`);
  }

  if (vendorAlreadyExisted) {
    const existingItems = await db.select().from(menuItems).where(eq(menuItems.vendorId, vendor.id)).limit(1);
    if (existingItems.length > 0) {
      console.log("Demo vendor already has menu/FAQ data — skipping re-seed. Done.");
      process.exit(0);
    }
  }

  console.log("Seeding menu items...");
  await db.insert(menuItems).values(
    [
      {
        name: "Classic Beef Shawarma",
        category: "shawarma" as const,
        description: "Grilled beef strips, garlic sauce, pickles, in a toasted wrap.",
        priceKobo: 250000,
        prepMinutes: 10,
      },
      {
        name: "Chicken Shawarma",
        category: "shawarma" as const,
        description: "Marinated grilled chicken, garlic mayo, veggies.",
        priceKobo: 230000,
        prepMinutes: 10,
      },
      {
        name: "Spicy Chicken Shawarma",
        category: "shawarma" as const,
        description: "Chicken shawarma with extra chili sauce.",
        priceKobo: 240000,
        prepMinutes: 12,
      },
      {
        name: "Mixed Meat Shawarma",
        category: "shawarma" as const,
        description: "Beef and chicken combo with special sauce.",
        priceKobo: 280000,
        prepMinutes: 15,
      },
      {
        name: "Meat Pie",
        category: "pastry" as const,
        description: "Flaky pastry filled with seasoned minced meat and potatoes.",
        priceKobo: 80000,
        prepMinutes: 5,
      },
      {
        name: "Sausage Roll",
        category: "pastry" as const,
        description: "Classic sausage wrapped in golden puff pastry.",
        priceKobo: 60000,
        prepMinutes: 5,
      },
      {
        name: "Chicken Pie",
        category: "pastry" as const,
        description: "Buttery pastry filled with creamy chicken filling.",
        priceKobo: 90000,
        prepMinutes: 5,
      },
      {
        name: "Doughnut",
        category: "pastry" as const,
        description: "Soft, sugar-coated doughnut.",
        priceKobo: 40000,
        prepMinutes: 3,
      },
      {
        name: "Chapman",
        category: "drink" as const,
        description: "Refreshing Nigerian fruit cocktail, chilled.",
        priceKobo: 100000,
        prepMinutes: 3,
      },
      {
        name: "Zobo",
        category: "drink" as const,
        description: "Chilled hibiscus drink with ginger and pineapple.",
        priceKobo: 80000,
        prepMinutes: 3,
      },
      {
        name: "Bottled Water",
        category: "drink" as const,
        description: "50cl bottled water.",
        priceKobo: 30000,
        prepMinutes: 1,
      },
    ].map((item) => ({ ...item, vendorId: vendor!.id }))
  );

  console.log("Seeding FAQs...");
  await db.insert(faqs).values(
    [
      {
        keywords: ["hour", "open", "close", "time"],
        question: "What are your opening hours?",
        answer: "We're open every day from 10am to 9pm.",
      },
      {
        keywords: ["location", "address", "where", "find you"],
        question: "Where are you located?",
        answer: "We're at 12 Allen Avenue, Ikeja, Lagos. Look out for the red and white awning!",
      },
      {
        keywords: ["delivery", "deliver"],
        question: "Do you deliver?",
        answer:
          "Right now we're pickup-only, but delivery is coming soon! You'll get a notification here when your order is ready to collect.",
      },
      {
        keywords: ["pay", "payment", "card", "transfer"],
        question: "How do I pay?",
        answer:
          "After you build your order, we'll send you a secure Paystack payment link — pay by card, bank transfer, or USSD.",
      },
      {
        keywords: ["allerg", "ingredient", "halal", "pork", "vegetarian", "vegan"],
        question: "Do you have allergen/ingredient info?",
        answer:
          "All our meat is halal. Our shawarmas contain wheat (wrap) and dairy (garlic sauce). Ask about a specific item and we'll get you details!",
      },
      {
        keywords: ["cancel", "refund"],
        question: "Can I cancel my order?",
        answer:
          'You can cancel any time before payment by typing "cancel". Once paid, please contact us directly for refund requests since prep may have already started.',
      },
    ].map((faq) => ({ ...faq, vendorId: vendor!.id }))
  );

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
