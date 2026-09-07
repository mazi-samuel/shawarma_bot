"use client";

import { useEffect, useState, useCallback, use } from "react";

interface MenuItem {
  id: number;
  name: string;
  category: "shawarma" | "pastry" | "drink";
  description: string;
  priceKobo: number;
  prepMinutes: number;
  isAvailable: boolean;
}

const EMPTY_FORM = {
  name: "",
  category: "shawarma" as MenuItem["category"],
  description: "",
  price: "",
  prepMinutes: "",
};

export default function AdminMenuPage({ params }: { params: Promise<{ vendorSlug: string }> }) {
  const { vendorSlug } = use(params);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/${vendorSlug}/menu`);
    setItems(await res.json());
    setLoading(false);
  }, [vendorSlug]);

  useEffect(() => {
    load();
  }, [load]);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/admin/${vendorSlug}/menu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        category: form.category,
        description: form.description,
        priceKobo: Math.round(Number(form.price) * 100),
        prepMinutes: Number(form.prepMinutes),
      }),
    });
    if (res.ok) {
      setForm(EMPTY_FORM);
      await load();
    } else {
      alert("Failed to add item — check the fields.");
    }
  }

  async function toggleAvailable(item: MenuItem) {
    await fetch(`/api/admin/${vendorSlug}/menu/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isAvailable: !item.isAvailable }),
    });
    await load();
  }

  async function deleteItem(id: number) {
    if (!confirm("Delete this menu item?")) return;
    await fetch(`/api/admin/${vendorSlug}/menu/${id}`, { method: "DELETE" });
    await load();
  }

  if (loading) return <p>Loading menu…</p>;

  return (
    <div>
      <h1>Menu</h1>

      <form className="card" onSubmit={addItem} style={{ display: "grid", gap: 8, maxWidth: 420 }}>
        <strong>Add item</strong>
        <input
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <select
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value as MenuItem["category"] })}
        >
          <option value="shawarma">Shawarma</option>
          <option value="pastry">Pastry</option>
          <option value="drink">Drink</option>
        </select>
        <textarea
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <input
          placeholder="Price (major currency unit, e.g. 25.00)"
          type="number"
          min="0"
          step="0.01"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          required
        />
        <input
          placeholder="Prep time (minutes)"
          type="number"
          min="1"
          step="1"
          value={form.prepMinutes}
          onChange={(e) => setForm({ ...form, prepMinutes: e.target.value })}
          required
        />
        <button className="primary" type="submit">
          Add item
        </button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Price</th>
            <th>Prep</th>
            <th>Available</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>{item.category}</td>
              <td>{(item.priceKobo / 100).toLocaleString()}</td>
              <td>{item.prepMinutes} min</td>
              <td>
                <button onClick={() => toggleAvailable(item)}>
                  {item.isAvailable ? "Available" : "Hidden"}
                </button>
              </td>
              <td>
                <button onClick={() => deleteItem(item.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
