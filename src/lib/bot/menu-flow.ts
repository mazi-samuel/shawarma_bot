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

/** Admin listing — includes unavailable items too, unlike getAvailableCategories/getItemsForCategory. */
export async function getAllMenuItems(vendorId: number) {
  return db.select().from(menuItems).where(eq(menuItems.vendorId, vendorId)).orderBy(menuItems.category, menuItems.name);
}

export async function getMenuItemById(vendorId: number, id: number) {
  const rows = await db
    .select()
    .from(menuItems)
    .where(and(eq(menuItems.id, id), eq(menuItems.vendorId, vendorId)))
    .limit(1);
  return rows[0];
}

export async function createMenuItem(
  vendorId: number,
  input: { name: string; category: MenuCategory; priceKobo: number; prepMinutes: number }
) {
  const [created] = await db
    .insert(menuItems)
    .values({ vendorId, ...input })
    .returning();
  return created;
}

export async function setMenuItemAvailability(vendorId: number, id: number, isAvailable: boolean) {
  const [updated] = await db
    .update(menuItems)
    .set({ isAvailable, updatedAt: new Date() })
    .where(and(eq(menuItems.id, id), eq(menuItems.vendorId, vendorId)))
    .returning();
  return updated;
}

export async function deleteMenuItem(vendorId: number, id: number): Promise<boolean> {
  const deleted = await db
    .delete(menuItems)
    .where(and(eq(menuItems.id, id), eq(menuItems.vendorId, vendorId)))
    .returning();
  return deleted.length > 0;
}

export function computeCartTotalKobo(cart: CartLine[]): number {
  return cart.reduce((sum, line) => sum + line.unitPriceKobo * line.quantity, 0);
}

/** Business rule: quoted prep time is the longest single item in the order, not the sum. */
export function computeEtaMinutes(cart: CartLine[]): number {
  return cart.reduce((max, line) => Math.max(max, line.prepMinutes), 0);
}
