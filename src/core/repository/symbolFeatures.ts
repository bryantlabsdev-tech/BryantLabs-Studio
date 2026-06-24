/**
 * Feature-oriented symbol targeting (Phase 20).
 * Maps common product terms to symbol names and path patterns.
 */

export interface SymbolFeatureHint {
  readonly id: string;
  readonly terms: readonly string[];
  readonly symbolNames: readonly string[];
  readonly pathFragments: readonly string[];
}

export const SYMBOL_FEATURE_HINTS: readonly SymbolFeatureHint[] = [
  {
    id: "dashboard",
    terms: ["dashboard"],
    symbolNames: ["Dashboard", "dashboard"],
    pathFragments: ["dashboard"],
  },
  {
    id: "sidebar",
    terms: ["sidebar", "sidenav", "sidepanel", "navigation", "navbar", "nav"],
    symbolNames: ["Sidebar", "SideBar", "Navigation", "Nav", "Navbar"],
    pathFragments: ["sidebar", "navigation", "nav"],
  },
  {
    id: "client",
    terms: ["client", "clients", "clientdetail", "client-detail"],
    symbolNames: [
      "Client",
      "Clients",
      "ClientDetail",
      "ClientDetails",
      "ClientList",
      "createClient",
      "updateClient",
    ],
    pathFragments: ["client"],
  },
  {
    id: "notes",
    terms: ["note", "notes"],
    symbolNames: [
      "Note",
      "Notes",
      "NoteList",
      "NoteDetail",
      "createNote",
      "updateNote",
    ],
    pathFragments: ["note"],
  },
  {
    id: "search",
    terms: ["search", "filter", "filters", "query"],
    symbolNames: [
      "Search",
      "SearchBar",
      "SearchBox",
      "Filter",
      "Filters",
      "FilterPanel",
    ],
    pathFragments: ["search", "filter"],
  },
];

export function detectSymbolFeatures(promptLower: string): SymbolFeatureHint[] {
  const normalized = promptLower.replace(/[^a-z0-9]+/g, " ");
  return SYMBOL_FEATURE_HINTS.filter((hint) =>
    hint.terms.some((term) => normalized.includes(term)),
  );
}
