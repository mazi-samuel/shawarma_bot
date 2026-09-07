import { NextRequest, NextResponse } from "next/server";
import { getVendorBySlug, type Vendor } from "@/lib/vendor/vendor";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

type RequireVendorResult = { vendor: Vendor } | { response: NextResponse };

/**
 * Guards a vendor-scoped /api/admin/[vendorSlug]/* route: the session cookie
 * must verify AND belong to the vendor named in the URL, so one vendor's
 * logged-in session can never read or mutate another vendor's data.
 */
export async function requireVendor(req: NextRequest, slug: string): Promise<RequireVendorResult> {
  const vendor = await getVendorBySlug(slug);
  if (!vendor) {
    return { response: NextResponse.json({ error: "Vendor not found" }, { status: 404 }) };
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessionVendorId = verifySessionToken(token);

  if (sessionVendorId === null || sessionVendorId !== vendor.id) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { vendor };
}
