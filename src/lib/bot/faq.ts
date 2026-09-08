import { eq, and } from "drizzle-orm";
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

export async function getAllFaqs(vendorId: number) {
  return db.select().from(faqs).where(eq(faqs.vendorId, vendorId));
}

export async function getFaqById(vendorId: number, id: number) {
  const rows = await db
    .select()
    .from(faqs)
    .where(and(eq(faqs.id, id), eq(faqs.vendorId, vendorId)))
    .limit(1);
  return rows[0];
}

export async function createFaq(
  vendorId: number,
  input: { question: string; answer: string; keywords: string[] }
) {
  const [created] = await db
    .insert(faqs)
    .values({ vendorId, ...input })
    .returning();
  return created;
}

export async function deleteFaq(vendorId: number, id: number): Promise<boolean> {
  const deleted = await db
    .delete(faqs)
    .where(and(eq(faqs.id, id), eq(faqs.vendorId, vendorId)))
    .returning();
  return deleted.length > 0;
}
