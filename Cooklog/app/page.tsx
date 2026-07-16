"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Ingredient = { id: number; name: string; category: string; season: string };
type Recipe = { id: number; title: string; note: string; servings: number; status: string; updatedAt: string; ingredients: { name: string; amount: string }[] };
type Data = { recipes: Recipe[]; ingredients: Ingredient[] };

export default function Home() {
  const [data, setData] = useState<Data>({ recipes: [], ingredients: [] });
  const [active, setActive] = useState<"recipes" | "ingredients">("recipes");
  const [query, setQuery] = useState("");
  const [showRecipe, setShowRecipe] = useState(false);
  const [showIngredient, setShowIngredient] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const response = await fetch("/api/cookbook");
    if (response.ok) setData(await response.json());
  };
  useEffect(() => { void refresh(); }, []);

  const filteredRecipes = useMemo(() => data.recipes.filter((recipe) =>
    `${recipe.title} ${recipe.note} ${recipe.ingredients.map((item) => item.name).join(" ")}`.toLowerCase().includes(query.toLowerCase())
  ), [data.recipes, query]);
  const filteredIngredients = useMemo(() => data.ingredients.filter((ingredient) =>
    `${ingredient.name} ${ingredient.category}`.toLowerCase().includes(query.toLowerCase())
  ), [data.ingredients, query]);

  async function addRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    await fetch("/api/cookbook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      type: "recipe", title: form.get("title"), servings: form.get("servings"), note: form.get("note"), ingredients: String(form.get("ingredients") ?? "").split(",").map((name) => name.trim()).filter(Boolean),
    }) });
    event.currentTarget.reset(); setShowRecipe(false); setBusy(false); void refresh();
  }
  async function addIngredient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    await fetch("/api/cookbook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "ingredient", name: form.get("name"), category: form.get("category"), season: form.get("season") }) });
    event.currentTarget.reset(); setShowIngredient(false); setBusy(false); void refresh();
  }

  return <main>
    <header className="topbar"><a className="wordmark" href="#top">cooklog<span>.</span></a><nav><a href="#recipes">recipes</a><a href="#ingredients">ingredients</a><a href="#journal">journal</a></nav><button className="icon-button" aria-label="Open menu">☰</button></header>
    <section className="hero" id="top"><p className="eyebrow">YOUR PERSONAL COOKBOOK</p><h1>Good food,<br/><em>well remembered.</em></h1><p className="intro">A quiet place for recipes worth making again — with room for the little things you learn along the way.</p><div className="hero-actions"><button className="button primary" onClick={() => setShowRecipe(true)}>＋ New recipe</button><button className="button" onClick={() => setShowIngredient(true)}>Add ingredient</button></div></section>
    <section className="workspace" id={active}>
      <div className="section-head"><div><p className="eyebrow">YOUR COLLECTION</p><h2>{active === "recipes" ? "Recipes" : "Ingredients"}</h2></div><div className="count">{active === "recipes" ? data.recipes.length : data.ingredients.length} {active}</div></div>
      <div className="controls"><div className="tabs"><button className={active === "recipes" ? "selected" : ""} onClick={() => setActive("recipes")}>Recipes</button><button className={active === "ingredients" ? "selected" : ""} onClick={() => setActive("ingredients")}>Ingredients</button></div><label className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${active}...`} /></label></div>
      {active === "recipes" ? <div className="recipe-grid" id="recipes">{filteredRecipes.map((recipe, index) => <article className="recipe-card" key={recipe.id}><div className={`recipe-image image-${index % 3}`}><span>{recipe.status}</span><b>{String(recipe.id).padStart(2, "0")}</b></div><div className="card-body"><p className="eyebrow">{recipe.servings} SERVINGS · UPDATED {recipe.updatedAt}</p><h3>{recipe.title}</h3><p>{recipe.note || "A recipe waiting for its note."}</p><div className="ingredient-line">{recipe.ingredients.slice(0, 3).map((item) => item.name).join(" · ")}</div></div></article>)}{filteredRecipes.length === 0 && <p className="empty">No recipes found. Add your first one.</p>}</div> : <div className="ingredient-table" id="ingredients"><div className="table-row table-label"><span>Ingredient</span><span>Category</span><span>Best season</span></div>{filteredIngredients.map((ingredient) => <div className="table-row" key={ingredient.id}><strong>{ingredient.name}</strong><span>{ingredient.category}</span><span>{ingredient.season}</span></div>)}{filteredIngredients.length === 0 && <p className="empty">No ingredients found.</p>}</div>}
    </section>
    <section className="journal" id="journal"><p className="eyebrow">THE COOKING JOURNAL</p><h2>Small notes become<br/><em>the best recipes.</em></h2><p>Save substitutions, memories and photos after every cook. Your future self will thank you.</p><button className="text-link">Open journal →</button></section>
    {(showRecipe || showIngredient) && <div className="overlay" onMouseDown={() => { setShowRecipe(false); setShowIngredient(false); }}><section className="modal" onMouseDown={(e) => e.stopPropagation()}><button className="close" onClick={() => { setShowRecipe(false); setShowIngredient(false); }}>×</button>{showRecipe ? <form onSubmit={addRecipe}><p className="eyebrow">NEW RECIPE</p><h2>Write it down.</h2><label>Recipe name<input required name="title" placeholder="Alex’s creamy garlic pork chops" /></label><label>Servings<input required name="servings" type="number" min="1" defaultValue="2" /></label><label>Ingredients <small>separate with commas</small><input name="ingredients" placeholder="pork chops, garlic, cream" /></label><label>A small note<textarea name="note" placeholder="What makes this one worth keeping?" /></label><button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save recipe"}</button></form> : <form onSubmit={addIngredient}><p className="eyebrow">INGREDIENT LIBRARY</p><h2>Add an ingredient.</h2><label>Name<input required name="name" placeholder="e.g. Summer squash" /></label><label>Category<input required name="category" placeholder="e.g. Produce" /></label><label>Best season<input required name="season" placeholder="e.g. Jun — Sep" /></label><button className="button primary" disabled={busy}>{busy ? "Saving…" : "Add ingredient"}</button></form>}</section></div>}
  </main>;
}
