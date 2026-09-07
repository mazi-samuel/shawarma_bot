import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { faqs } from "@/lib/db/schema";
import { requireVendor } from "@/lib/auth/require-vendor";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ vendorSlug: string; id: string }> }
) {
  const { vendorSlug, id } = await params;
  const auth = await requireVendor(req, vendorSlug);
  if ("response" in auth) return auth.response;

  const faqId = Number(id);
  if (!Number.isFinite(faqId)) {
    return NextResponse.json({ error: "Invalid faq id" }, { status: 400 });
  }

  await db.delete(faqs).where(and(eq(faqs.id, faqId), eq(faqs.vendorId, auth.vendor.id)));
  return NextResponse.json({ deleted: true });
}
