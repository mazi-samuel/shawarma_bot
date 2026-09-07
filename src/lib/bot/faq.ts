import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { faqs } from "@/lib/db/schema";

export async function matchFaq(vendorId: number, userText: string): Promise<string | null> {
  const normalized = userText.toLowerCase();
  const rows = await db.select().from(faqs).where(eq(faqs.vendorId, vendorId));

  for (const row of rows) {
    if (row.keywords.some((kw) => normalized.includes(kw.toLowerCase()))) {
      return row.answer;
    }
  }

  return null;
}

export async function listFaqTopics(vendorId: number): Promise<string[]> {
  const rows = await db.select().from(faqs).where(eq(faqs.vendorId, vendorId));
  return rows.map((r) => r.question);
}
