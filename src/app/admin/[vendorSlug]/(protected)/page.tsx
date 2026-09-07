"use client";

import { useEffect, useState, useCallback, use } from "react";

interface OrderItem {
  quantity: number;
  unitPriceKobo: number;
  name: string;
}

interface Order {
  id: number;
  status: string;
  totalKobo: number;
  customerName: string | null;
  customerPhone: string;
  estimatedReadyAt: string | null;
  createdAt: string;
  items: OrderItem[];
}

const NEXT_STATUS: Record<string, { label: string; next: string } | undefined> = {
  paid: { label: "Mark preparing", next: "preparing" },
  preparing: { label: "Mark ready", next: "ready" },
  ready: { label: "Mark completed", next: "completed" },
};

function formatMoney(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

export default function AdminOrdersPage({ params }: { params: Promise<{ vendorSlug: string }> }) {
  const { vendorSlug } = use(params);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/${vendorSlug}/orders`);
      if (!res.ok) throw new Error(`Failed to load orders (${res.status})`);
      setOrders(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [vendorSlug]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [load]);

  async function advanceStatus(orderId: number, nextStatus: string) {
    const res = await fetch(`/api/admin/${vendorSlug}/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (res.ok) {
      await load();
    } else {
      alert("Failed to update order status");
    }
  }

  if (loading) return <p>Loading orders…</p>;
  if (error) return <p style={{ color: "crimson" }}>{error}</p>;

  return (
    <div>
      <h1>Orders</h1>
      {orders.length === 0 && <p className="muted">No orders yet.</p>}
      {orders.map((order) => {
        const action = NEXT_STATUS[order.status];
        return (
          <div className="card" key={order.id}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>Order #{order.id}</strong>
              <span className="badge">{order.status}</span>
            </div>
            <p className="muted">
              {order.customerName ?? "Unknown"} · {order.customerPhone}
            </p>
            <ul>
              {order.items.map((item, idx) => (
                <li key={idx}>
                  {item.quantity}x {item.name} — {formatMoney(item.unitPriceKobo * item.quantity)}
                </li>
              ))}
            </ul>
            <p>
              Total: <strong>{formatMoney(order.totalKobo)}</strong>
            </p>
            {order.estimatedReadyAt && (
              <p className="muted">
                ETA: {new Date(order.estimatedReadyAt).toLocaleTimeString("en-NG")}
              </p>
            )}
            {action && (
              <button className="primary" onClick={() => advanceStatus(order.id, action.next)}>
                {action.label}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
