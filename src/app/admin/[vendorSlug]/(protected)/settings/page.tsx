"use client";

import { useEffect, useState, use } from "react";

interface Settings {
  businessName: string;
  currency: string;
  timezone: string;
  vendorNotifyPhone: string | null;
  greetingMessage: string | null;
  whatsappConfigured: boolean;
  whatsappPhoneNumberId: string | null;
  paystackConfigured: boolean;
  paystackWebhookUrl: string;
}

export default function AdminSettingsPage({ params }: { params: Promise<{ vendorSlug: string }> }) {
  const { vendorSlug } = use(params);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState({
    businessName: "",
    currency: "",
    vendorNotifyPhone: "",
    greetingMessage: "",
    whatsappPhoneNumberId: "",
    whatsappToken: "",
    paystackSecretKey: "",
    newPassword: "",
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/admin/${vendorSlug}/settings`)
      .then((res) => res.json())
      .then((data: Settings) => {
        setSettings(data);
        setForm((f) => ({
          ...f,
          businessName: data.businessName,
          currency: data.currency,
          vendorNotifyPhone: data.vendorNotifyPhone ?? "",
          greetingMessage: data.greetingMessage ?? "",
          whatsappPhoneNumberId: data.whatsappPhoneNumberId ?? "",
        }));
      });
  }, [vendorSlug]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload: Record<string, string> = {
      businessName: form.businessName,
      currency: form.currency,
      vendorNotifyPhone: form.vendorNotifyPhone,
      greetingMessage: form.greetingMessage,
      whatsappPhoneNumberId: form.whatsappPhoneNumberId,
    };
    // Only send secrets if the vendor actually typed a new one — blank means "leave unchanged".
    if (form.whatsappToken) payload.whatsappToken = form.whatsappToken;
    if (form.paystackSecretKey) payload.paystackSecretKey = form.paystackSecretKey;
    if (form.newPassword) payload.newPassword = form.newPassword;

    const res = await fetch(`/api/admin/${vendorSlug}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) {
      setSettings(await res.json());
      setForm((f) => ({ ...f, whatsappToken: "", paystackSecretKey: "", newPassword: "" }));
      setSavedAt(Date.now());
    } else {
      alert("Failed to save settings");
    }
  }

  if (!settings) return <p>Loading settings…</p>;

  return (
    <div>
      <h1>Settings</h1>
      <form onSubmit={save} style={{ display: "grid", gap: 20, maxWidth: 560 }}>
        <div className="card">
          <strong>Business</strong>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            <label>
              Business name
              <br />
              <input
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                style={{ width: "100%" }}
              />
            </label>
            <label>
              Currency (3-letter code)
              <br />
              <input
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                maxLength={3}
              />
            </label>
            <label>
              Vendor notification number (WhatsApp, digits only, e.g. 2348012345678)
              <br />
              <input
                value={form.vendorNotifyPhone}
                onChange={(e) => setForm({ ...form, vendorNotifyPhone: e.target.value })}
                style={{ width: "100%" }}
              />
            </label>
            <label>
              Custom greeting (optional — leave blank for the default)
              <br />
              <textarea
                value={form.greetingMessage}
                onChange={(e) => setForm({ ...form, greetingMessage: e.target.value })}
                style={{ width: "100%" }}
              />
            </label>
          </div>
        </div>

        <div className="card">
          <strong>WhatsApp</strong>{" "}
          <span className="badge">{settings.whatsappConfigured ? "Configured" : "Not configured"}</span>
          <p className="muted">
            Get these from your Meta App → WhatsApp → API Setup page, after adding this
            business&apos;s phone number to the platform&apos;s shared Meta App.
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            <label>
              Phone Number ID
              <br />
              <input
                value={form.whatsappPhoneNumberId}
                onChange={(e) => setForm({ ...form, whatsappPhoneNumberId: e.target.value })}
                style={{ width: "100%" }}
              />
            </label>
            <label>
              Access token (leave blank to keep the current one)
              <br />
              <input
                type="password"
                value={form.whatsappToken}
                onChange={(e) => setForm({ ...form, whatsappToken: e.target.value })}
                style={{ width: "100%" }}
                placeholder={settings.whatsappConfigured ? "••••••••" : ""}
              />
            </label>
          </div>
        </div>

        <div className="card">
          <strong>Paystack</strong>{" "}
          <span className="badge">{settings.paystackConfigured ? "Configured" : "Not configured"}</span>
          <p className="muted">
            Set this vendor&apos;s webhook URL in their own Paystack dashboard (Settings → API Keys
            &amp; Webhooks) to:
            <br />
            <code>{settings.paystackWebhookUrl}</code>
          </p>
          <label>
            Secret key (leave blank to keep the current one)
            <br />
            <input
              type="password"
              value={form.paystackSecretKey}
              onChange={(e) => setForm({ ...form, paystackSecretKey: e.target.value })}
              style={{ width: "100%" }}
              placeholder={settings.paystackConfigured ? "••••••••" : ""}
            />
          </label>
        </div>

        <div className="card">
          <strong>Admin password</strong>
          <div style={{ marginTop: 8 }}>
            <label>
              New password (leave blank to keep the current one)
              <br />
              <input
                type="password"
                value={form.newPassword}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                style={{ width: "100%" }}
              />
            </label>
          </div>
        </div>

        <div>
          <button className="primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
          {savedAt && (
            <span className="muted" style={{ marginLeft: 12 }}>
              Saved!
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
