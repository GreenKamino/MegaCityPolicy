export type BmTab = "market" | "contraband" | "spyops" | "intel" | "audit";

export const BM_TABS: { id: BmTab; label: string }[] = [
  { id: "market", label: "MARKET" },
  { id: "contraband", label: "CONTRABAND" },
  { id: "spyops", label: "SPY OPS" },
  { id: "intel", label: "INTEL" },
  { id: "audit", label: "AUDIT" },
];
