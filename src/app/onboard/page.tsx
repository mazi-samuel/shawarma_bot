"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    businessName: "",
    adminPassword: "",
    currency: "NGN",
    vendorNotifyPhone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ slug: string; paystackWebhookUrl: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setLoading(false);
    if (res.ok) {
      setResult(await res.json());
    } else {
      const body = await res.json().catch(() => ({}));
      setError(typeof body.error === "string" ? body.error : "Something went wrong — check your inputs.");
    }
  }

  if (result) {
    return (
      <main style={{ padding: 40, maxWidth: 560, margin: "0 auto" }}>
        <h1>🎉 You&apos;re set up!</h1>
        <p>
          Your vendor slug is <strong>{result.slug}</strong>. Your admin dashboard has a starter
          menu and FAQ set already loaded — edit or delete anything from there.
        </p>
        <div className="card">
          <strong>Next steps</strong>
          <ol>
            <li>
              Add this vendor&apos;s WhatsApp Phone Number ID + access token and Paystack secret
              key from the Settings page (you can do this any time — the bot works for demo
              purposes without them, but can&apos;t actually send/receive WhatsApp messages or
              take payments until they&apos;re set).
            </li>
            <li>
              In your Paystack dashboard, set the webhook URL to:
              <br />
              <code>{result.paystackWebhookUrl}</code>
            </li>
          </ol>
        </div>
        <button className="primary" onClick={() => router.push(`/admin/${result.slug}`)}>
          Go to my dashboard
        </button>
      </main>
    );
  }

  return (
    <main style={{ padding: 40, maxWidth: 480, margin: "0 auto" }}>
      <h1>🌯 Set up your bot</h1>
      <p className="muted">Get your own WhatsApp ordering bot running in under a minute.</p>
      <form onSubmit={handleSubmit} className="card" style={{ display: "grid", gap: 12 }}>
        <label>
          Business name
          <br />
          <input
            value={form.businessName}
            onChange={(e) => setForm({ ...form, businessName: e.target.value })}
            placeholder="Mama's Shawarma & Pastries"
            style={{ width: "100%" }}
            required
          />
        </label>
        <label>
          Admin password
          <br />
          <input
            type="password"
            value={form.adminPassword}
            onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
            style={{ width: "100%" }}
            required
            minLength={4}
          />
        </label>
        <label>
          Currency
          <br />
          <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            <option value="NGN">NGN — Nigerian Naira</option>
            <option value="GHS">GHS — Ghanaian Cedi</option>
            <option value="KES">KES — Kenyan Shilling</option>
            <option value="ZAR">ZAR — South African Rand</option>
            <option value="USD">USD — US Dollar</option>
          </select>
        </label>
        <label>
          Your WhatsApp number for order notifications (optional, can add later)
          <br />
          <input
            value={form.vendorNotifyPhone}
            onChange={(e) => setForm({ ...form, vendorNotifyPhone: e.target.value })}
            placeholder="2348012345678"
            style={{ width: "100%" }}
          />
        </label>
        {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}
        <button className="primary" type="submit" disabled={loading}>
          {loading ? "Setting up…" : "Create my bot"}
        </button>
      </form>
    </main>
  );
}
