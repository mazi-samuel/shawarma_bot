export default function Home() {
  return (
    <main style={{ padding: 40, maxWidth: 560, fontFamily: "sans-serif" }}>
      <h1>🌯 Shawarma Bot</h1>
      <p>
        This is a WhatsApp ordering bot platform. There is no dashboard or sign-up form here —
        everything, for both customers and vendors, happens inside WhatsApp:
      </p>
      <ul>
        <li>Customers order, pay, and get status updates by messaging a vendor&apos;s WhatsApp number.</li>
        <li>Vendors register, manage their menu/FAQs, and update order status by messaging too.</li>
      </ul>
      <p>This page exists only because a web server has to answer requests to &quot;/&quot;.</p>
    </main>
  );
}
