import { getD1 } from "../../../db";

const schema = [
  "CREATE TABLE IF NOT EXISTS ingredients (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, category TEXT NOT NULL, season TEXT NOT NULL DEFAULT 'All year')",
  "CREATE TABLE IF NOT EXISTS recipes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', servings INTEGER NOT NULL DEFAULT 2, status TEXT NOT NULL DEFAULT 'Draft', updated_at TEXT NOT NULL DEFAULT 'Today')",
  "CREATE TABLE IF NOT EXISTS recipe_ingredients (id INTEGER PRIMARY KEY AUTOINCREMENT, recipe_id INTEGER NOT NULL, ingredient_id INTEGER NOT NULL, amount TEXT NOT NULL DEFAULT 'to taste', FOREIGN KEY(recipe_id) REFERENCES recipes(id), FOREIGN KEY(ingredient_id) REFERENCES ingredients(id))",
];
const seedIngredients = [["Garlic", "Aromatics", "All year"], ["Pork chops", "Meat", "All year"], ["Heavy cream", "Dairy", "All year"], ["Summer squash", "Produce", "Jun — Sep"], ["Basil", "Herbs", "Jun — Oct"], ["Lemon", "Produce", "Nov — May"]];

async function ready() {
  const db = getD1();
  await db.batch(schema.map((statement) => db.prepare(statement)));
  const existing = await db.prepare("SELECT COUNT(*) AS count FROM recipes").first<{ count: number }>();
  if (!existing?.count) {
    await db.batch(seedIngredients.map(([name, category, season]) => db.prepare("INSERT OR IGNORE INTO ingredients (name, category, season) VALUES (?, ?, ?)").bind(name, category, season)));
    const recipes = [["Pork chops with creamy garlic", "Golden-edged chops and a quick pan sauce. Better with something green alongside.", 2], ["Late summer pasta", "The one to make when the garden is louder than the grocery list.", 4], ["Lemon olive-oil cake", "A not-too-sweet cake for coffee, breakfast, or an ordinary Wednesday.", 8]];
    await db.batch(recipes.map(([title, note, servings]) => db.prepare("INSERT INTO recipes (title, note, servings, status, updated_at) VALUES (?, ?, ?, 'Private', 'Today')").bind(title, note, servings)));
    await db.batch([db.prepare("INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount) VALUES (1, 1, '4 cloves')"), db.prepare("INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount) VALUES (1, 2, '2 chops')"), db.prepare("INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount) VALUES (1, 3, '⅓ cup')"), db.prepare("INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount) VALUES (2, 4, '2 small')"), db.prepare("INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount) VALUES (2, 5, '1 handful')"), db.prepare("INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount) VALUES (3, 6, '2')")]);
  }
  return db;
}

export async function GET() {
  try { const db = await ready(); const recipes = await db.prepare("SELECT id, title, note, servings, status, updated_at AS updatedAt FROM recipes ORDER BY id DESC").all(); const ingredients = await db.prepare("SELECT id, name, category, season FROM ingredients ORDER BY name").all(); const links = await db.prepare("SELECT ri.recipe_id AS recipeId, i.name, ri.amount FROM recipe_ingredients ri JOIN ingredients i ON i.id = ri.ingredient_id").all(); return Response.json({ recipes: recipes.results.map((recipe: Record<string, unknown>) => ({ ...recipe, ingredients: links.results.filter((link: Record<string, unknown>) => link.recipeId === recipe.id) })), ingredients: ingredients.results }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not open cookbook." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try { const payload = await request.json() as { type?: string; title?: string; note?: string; servings?: string; ingredients?: string[]; name?: string; category?: string; season?: string }; const db = await ready(); if (payload.type === "ingredient") { const name = payload.name?.trim(); if (!name) return Response.json({ error: "Name is required." }, { status: 400 }); await db.prepare("INSERT OR IGNORE INTO ingredients (name, category, season) VALUES (?, ?, ?)").bind(name, payload.category?.trim() || "Other", payload.season?.trim() || "All year").run(); } else { const title = payload.title?.trim(); if (!title) return Response.json({ error: "Title is required." }, { status: 400 }); const created = await db.prepare("INSERT INTO recipes (title, note, servings, status, updated_at) VALUES (?, ?, ?, 'Private', 'Today') RETURNING id").bind(title, payload.note?.trim() || "", Math.max(1, Number(payload.servings) || 2)).first<{ id: number }>(); for (const rawName of payload.ingredients ?? []) { const name = rawName.trim(); if (!name) continue; await db.prepare("INSERT OR IGNORE INTO ingredients (name, category, season) VALUES (?, 'Other', 'All year')").bind(name).run(); const ingredient = await db.prepare("SELECT id FROM ingredients WHERE name = ?").bind(name).first<{ id: number }>(); if (ingredient && created) await db.prepare("INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount) VALUES (?, ?, 'to taste')").bind(created.id, ingredient.id).run(); } } return Response.json({ ok: true }, { status: 201 }); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not save entry." }, { status: 500 }); }
}
