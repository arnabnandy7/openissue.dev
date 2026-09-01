import {
  CONTRIBUTION_TYPE_FILTERS,
  EXPERIENCE_FILTERS,
  HACKTOBERFEST_FILTERS,
  LABEL_OPTIONS,
  LINKED_PR_FILTERS,
  READINESS_FILTERS,
  RESPONSIVENESS_FILTERS,
  SCOPE_FILTERS,
  SORT_OPTIONS,
} from "@/features/issues/data/search-options";

export type SavedSearch = {
  id: string;
  name: string;
  tech: string;
  label: string;
  sort: string;
  linkedPr: string;
  hacktoberfest: string;
  experience?: string;
  contributionType?: string;
  scope?: string;
  responsiveness?: string;
  readiness?: string;
  createdAt: string;
};

const STORAGE_KEY = "openissue:saved-searches";

export function isValidSavedSearch(value: unknown): value is SavedSearch {
  if (!value || typeof value !== "object") {
    return false;
  }

  const search = value as Partial<SavedSearch>;
  const experience = search.experience ?? "any";
  const contributionType = search.contributionType ?? "any";
  const scope = search.scope ?? "any";
  const responsiveness = search.responsiveness ?? "any";
  const readiness = search.readiness ?? "any";

  return (
    typeof search.id === "string" &&
    typeof search.name === "string" &&
    typeof search.tech === "string" &&
    typeof search.label === "string" &&
    typeof search.sort === "string" &&
    typeof search.linkedPr === "string" &&
    typeof search.hacktoberfest === "string" &&
    typeof search.createdAt === "string" &&
    LABEL_OPTIONS.some((option) => option.value === search.label) &&
    SORT_OPTIONS.some((option) => option.value === search.sort) &&
    LINKED_PR_FILTERS.has(search.linkedPr) &&
    HACKTOBERFEST_FILTERS.has(search.hacktoberfest) &&
    EXPERIENCE_FILTERS.has(experience) &&
    CONTRIBUTION_TYPE_FILTERS.has(contributionType) &&
    SCOPE_FILTERS.has(scope) &&
    RESPONSIVENESS_FILTERS.has(responsiveness) &&
    READINESS_FILTERS.has(readiness)
  );
}

export function getSavedSearches(): SavedSearch[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return [];
    }

    const parsed: unknown = JSON.parse(stored);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isValidSavedSearch);
  } catch {
    return [];
  }
}

function saveSavedSearches(searches: SavedSearch[]): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
    return true;
  } catch {
    return false;
    // Ignore storage failures so the search UI remains usable.
  }
}

export function replaceSavedSearches(searches: SavedSearch[]): void {
  if (!saveSavedSearches(searches)) {
    throw new Error("Unable to update saved searches.");
  }
}

let fallbackIdCounter = 0;

function createSavedSearchId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  fallbackIdCounter += 1;
  return `${Date.now()}-${fallbackIdCounter}`;
}

export function addSavedSearch(
  search: Omit<SavedSearch, "id" | "createdAt">,
): SavedSearch {
  const savedSearch: SavedSearch = {
    ...search,
    id: createSavedSearchId(),
    createdAt: new Date().toISOString(),
  };

  const searches = getSavedSearches();
  const saved = saveSavedSearches([...searches, savedSearch]);

  if (!saved) {
    throw new Error("Unable to save search.");
  }

  return savedSearch;
}

export function deleteSavedSearch(id: string): void {
  const searches = getSavedSearches();
  saveSavedSearches(searches.filter((search) => search.id !== id));
}
