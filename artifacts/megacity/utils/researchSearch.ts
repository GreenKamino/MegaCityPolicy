export type SearchableTechnology = {
  id: string;
  name: string;
  description?: string;
  category: string;
};

/** A technology annotated with the category it belongs to for search results. */
export type AnnotatedTechnology<T extends SearchableTechnology> = T & {
  categoryLabel: string;
};

/**
 * Match a query against every technology, regardless of the category currently
 * selected for browsing. Blank queries return no matches so callers can fall
 * back to their normal category view.
 */
export function searchAllTechnologies<T extends SearchableTechnology>(
  technologies: readonly T[],
  query: string,
  categoryLabels: Readonly<Record<string, string>>,
): AnnotatedTechnology<T>[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return technologies
    .filter((tech) =>
      tech.name.toLowerCase().includes(q) || tech.description?.toLowerCase().includes(q),
    )
    .map((tech) => ({
      ...tech,
      categoryLabel: categoryLabels[tech.category] ?? tech.category,
    }));
}

/** Rebuild the normal browsing list without changing the selected category. */
export function filterTechnologiesByCategory<T extends SearchableTechnology>(
  technologies: readonly T[],
  selectedCategory: string | "all",
): T[] {
  if (selectedCategory === "all") return [...technologies];
  return technologies.filter((tech) => tech.category === selectedCategory);
}