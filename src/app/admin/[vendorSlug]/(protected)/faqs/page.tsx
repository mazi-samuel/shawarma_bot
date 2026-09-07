"use client";

import { useEffect, useState, useCallback, use } from "react";

interface Faq {
  id: number;
  question: string;
  answer: string;
  keywords: string[];
}

const EMPTY_FORM = { question: "", answer: "", keywords: "" };

export default function AdminFaqsPage({ params }: { params: Promise<{ vendorSlug: string }> }) {
  const { vendorSlug } = use(params);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/${vendorSlug}/faqs`);
    setFaqs(await res.json());
    setLoading(false);
  }, [vendorSlug]);

  useEffect(() => {
    load();
  }, [load]);

  async function addFaq(e: React.FormEvent) {
    e.preventDefault();
    const keywords = form.keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    const res = await fetch(`/api/admin/${vendorSlug}/faqs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: form.question, answer: form.answer, keywords }),
    });
    if (res.ok) {
      setForm(EMPTY_FORM);
      await load();
    } else {
      alert("Failed to add FAQ — make sure you've entered at least one keyword.");
    }
  }

  async function deleteFaq(id: number) {
    if (!confirm("Delete this FAQ?")) return;
    await fetch(`/api/admin/${vendorSlug}/faqs/${id}`, { method: "DELETE" });
    await load();
  }

  if (loading) return <p>Loading FAQs…</p>;

  return (
    <div>
      <h1>FAQs</h1>
      <p className="muted">
        When a customer asks a question, we match it against these keywords (case-insensitive,
        substring match) and reply with the answer.
      </p>

      <form className="card" onSubmit={addFaq} style={{ display: "grid", gap: 8, maxWidth: 480 }}>
        <strong>Add FAQ</strong>
        <input
          placeholder="Question (shown as a topic hint)"
          value={form.question}
          onChange={(e) => setForm({ ...form, question: e.target.value })}
          required
        />
        <textarea
          placeholder="Answer"
          value={form.answer}
          onChange={(e) => setForm({ ...form, answer: e.target.value })}
          required
        />
        <input
          placeholder="Keywords, comma separated (e.g. hours, open, close)"
          value={form.keywords}
          onChange={(e) => setForm({ ...form, keywords: e.target.value })}
          required
        />
        <button className="primary" type="submit">
          Add FAQ
        </button>
      </form>

      {faqs.map((faq) => (
        <div className="card" key={faq.id}>
          <strong>{faq.question}</strong>
          <p>{faq.answer}</p>
          <p className="muted">Keywords: {faq.keywords.join(", ")}</p>
          <button onClick={() => deleteFaq(faq.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
