import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { faqs } from "@/lib/db/schema";
import { requireVendor } from "@/lib/auth/require-vendor";

const createSchema = z.object({
  question: z.string().min(1).max(300),
  answer: z.string().min(1).max(2000),
  keywords: z.array(z.string().min(1).max(40)).min(1).max(20),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ vendorSlug: string }> }) {
  const { vendorSlug } = await params;
  const auth = await requireVendor(req, vendorSlug);
  if ("response" in auth) return auth.response;

  const rows = await db.select().from(faqs).where(eq(faqs.vendorId, auth.vendor.id));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ vendorSlug: string }> }) {
  const { vendorSlug } = await params;
  const auth = await requireVendor(req, vendorSlug);
  if ("response" in auth) return auth.response;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [created] = await db
    .insert(faqs)
    .values({ ...parsed.data, vendorId: auth.vendor.id })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
