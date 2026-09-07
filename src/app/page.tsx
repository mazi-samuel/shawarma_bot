import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: 40, maxWidth: 640, margin: "0 auto" }}>
      <h1>🌯 Shawarma Bot</h1>
      <p className="muted">
        A WhatsApp ordering bot platform for shawarma &amp; pastry vendors — menu browsing,
        payments, prep-time ETAs, order status notifications, and FAQs, all inside WhatsApp.
        Customers interact with it entirely through WhatsApp; this site is for vendors.
      </p>
      <p>
        <Link href="/onboard">Set up a new vendor →</Link>
      </p>
      <p className="muted">
        Already have a bot? Your dashboard is at <code>/admin/&lt;your-slug&gt;</code>.
      </p>
    </main>
  );
}
