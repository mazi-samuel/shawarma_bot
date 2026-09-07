"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage({ params }: { params: Promise<{ vendorSlug: string }> }) {
  const { vendorSlug } = use(params);
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/admin/${vendorSlug}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push(`/admin/${vendorSlug}`);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Login failed");
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", padding: 24 }}>
      <h1>🌯 Admin Login</h1>
      <p className="muted">{vendorSlug}</p>
      <form onSubmit={handleSubmit} className="card" style={{ display: "grid", gap: 12 }}>
        <input
          type="password"
          placeholder="Admin password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          required
        />
        {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}
        <button className="primary" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
