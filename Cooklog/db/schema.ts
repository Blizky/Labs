import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const ingredients = sqliteTable("ingredients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  category: text("category").notNull(),
  season: text("season").notNull().default("All year"),
});

export const recipes = sqliteTable("recipes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  note: text("note").notNull().default(""),
  servings: integer("servings").notNull().default(2),
  status: text("status").notNull().default("Draft"),
  updatedAt: text("updated_at").notNull().default("Today"),
});

export const recipeIngredients = sqliteTable("recipe_ingredients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipeId: integer("recipe_id").notNull().references(() => recipes.id),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredients.id),
  amount: text("amount").notNull().default("to taste"),
});
