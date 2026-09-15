export const OVERVIEW_SECTION_TARGETS = ["status", "people", "infrastructure", "supply", "governance"] as const;
export type OverviewSectionTarget = typeof OVERVIEW_SECTION_TARGETS[number];

export function parseOverviewSectionTarget(value: string | string[] | undefined): OverviewSectionTarget | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return OVERVIEW_SECTION_TARGETS.includes(candidate as OverviewSectionTarget)
    ? candidate as OverviewSectionTarget
    : null;
}