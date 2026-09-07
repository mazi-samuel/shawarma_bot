import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getVendorBySlug } from "@/lib/vendor/vendor";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export default async function AdminVendorLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ vendorSlug: string }>;
}) {
  const { vendorSlug } = await params;
  const vendor = await getVendorBySlug(vendorSlug);

  if (!vendor) {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: 24, textAlign: "center" }}>
        <h2>Vendor not found</h2>
        <p className="muted">No vendor with slug &quot;{vendorSlug}&quot; exists.</p>
        <Link href="/onboard">Set up a new vendor</Link>
      </div>
    );
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const sessionVendorId = verifySessionToken(token);

  if (sessionVendorId !== vendor.id) {
    redirect(`/admin/${vendorSlug}/login`);
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
      <nav style={{ display: "flex", gap: 16, marginBottom: 24, alignItems: "baseline", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>🌯 {vendor.businessName}</h2>
        <Link href={`/admin/${vendorSlug}`}>Orders</Link>
        <Link href={`/admin/${vendorSlug}/menu`}>Menu</Link>
        <Link href={`/admin/${vendorSlug}/faqs`}>FAQs</Link>
        <Link href={`/admin/${vendorSlug}/settings`}>Settings</Link>
      </nav>
      {children}
    </div>
  );
}
