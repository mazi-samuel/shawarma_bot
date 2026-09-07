const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: "₦",
  GHS: "₵",
  KES: "KSh",
  ZAR: "R",
  USD: "$",
};

export function formatMoney(kobo: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  return `${symbol}${(kobo / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

export function formatEta(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}min`;
}

export function greeting(businessName: string, customGreeting?: string | null): string {
  if (customGreeting) return customGreeting;
  return `Welcome to ${businessName}! 🌯🥐\nHow can I help you today?`;
}

export const FALLBACK = `Sorry, I didn't quite get that. Type "menu" any time to go back to the main menu.`;

export const HUMAN_HANDOFF = `No problem — we've flagged your chat for a team member to reply personally. In the meantime, type "menu" to place an order or check on one.`;

export const ORDER_CANCELLED = `Your order has been cancelled. Type "menu" whenever you're ready to order again.`;

export const NO_ACTIVE_ORDER = `You don't have an active order right now. Type "menu" to place one.`;
