// Global building search for the construction browser (Task #531).
//
// The construction screen keeps its category/subcategory browsing state
// (activeCat / subFilter) untouched while a search query is active: the query
// simply swaps the list source to a global match across ALL categories, and
// clearing it falls back to the unchanged category view. Keeping these two
// list builders as pure functions lets tests prove both behaviors without
// mounting the screen's native component graph.

export type SearchableBuilding = {
  key: string;
  label: string;
  description: string;
  subcategory?: string;
};

export type SearchableCategory<B extends SearchableBuilding = SearchableBuilding> = {
  id: string;
  label: string;
  buildings: B[];
};

/** A building annotated with where it lives, so search rows can say so. */
export type AnnotatedBuilding<B extends SearchableBuilding> = B & {
  catId: string;
  catLabel: string;
};

/**
 * Match `query` against label + description of every building in every
 * category, ignoring the currently selected category/subcategory entirely.
 * Returns [] for a blank query (callers treat that as "not searching").
 */
export function searchAllBuildings<B extends SearchableBuilding>(
  categories: readonly SearchableCategory<B>[],
  query: string,
): AnnotatedBuilding<B>[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: AnnotatedBuilding<B>[] = [];
  for (const cat of categories) {
    for (const def of cat.buildings) {
      if (def.label.toLowerCase().includes(q) || def.description.toLowerCase().includes(q)) {
        results.push({ ...def, catId: cat.id, catLabel: cat.label });
      }
    }
  }
  return results;
}

/**
 * The normal (non-searching) category view: the selected category's
 * buildings, optionally narrowed to one subcategory.
 */
export function filterCategoryBuildings<B extends SearchableBuilding>(
  buildings: readonly B[],
  subFilter: string | null,
): B[] {
  if (!subFilter) return [...buildings];
  return buildings.filter((def) => def.subcategory === subFilter);
}
