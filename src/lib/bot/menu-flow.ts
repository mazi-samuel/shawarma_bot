import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { menuItems, type MenuCategory } from "@/lib/db/schema";

export const CATEGORY_LABELS: Record<MenuCategory, string> = {
  shawarma: "Shawarma",
  pastry: "Pastries",
  drink: "Drinks",
};

export interface CartLine {
  menuItemId: number;
  name: string;
  unitPriceKobo: number;
  prepMinutes: number;
  quantity: number;
}

export async function getAvailableCategories(vendorId: number): Promise<MenuCategory[]> {
  const rows = await db
    .selectDistinct({ category: menuItems.category })
    .from(menuItems)
    .where(and(eq(menuItems.vendorId, vendorId), eq(menuItems.isAvailable, true)));
  return rows.map((r) => r.category as MenuCategory);
}

export async function getItemsForCategory(vendorId: number, category: MenuCategory) {
  return db
    .select()
    .from(menuItems)
    .where(
      and(
        eq(menuItems.vendorId, vendorId),
        eq(menuItems.category, category),
        eq(menuItems.isAvailable, true)
      )
    );
}

export async function getMenuItemById(vendorId: number, id: number) {
  const rows = await db
    .select()
    .from(menuItems)
    .where(and(eq(menuItems.id, id), eq(menuItems.vendorId, vendorId)))
    .limit(1);
  return rows[0];
}

export function computeCartTotalKobo(cart: CartLine[]): number {
  return cart.reduce((sum, line) => sum + line.unitPriceKobo * line.quantity, 0);
}

/** Business rule: quoted prep time is the longest single item in the order, not the sum. */
export function computeEtaMinutes(cart: CartLine[]): number {
  return cart.reduce((max, line) => Math.max(max, line.prepMinutes), 0);
}
