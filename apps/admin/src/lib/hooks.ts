/**
 * Data hooks.
 *
 * Every screen fetches through these, so loading, error and empty
 * states behave the same everywhere, and every request is cancelled
 * when the component goes away rather than resolving into a dead tree.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, qs, type Paged } from "./api";

/** Keeps a value stable until the user stops typing. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return settled;
}

export interface Query<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** True only on the first load, so a refresh does not blank the screen. */
  initial: boolean;
  reload(): Promise<void>;
  /** Replaces the local copy without a round trip, after a write. */
  set(next: T): void;
}

/**
 * Fetches one endpoint and keeps it in sync.
 *
 * `path` null means "not ready yet" — used when a path depends on a
 * value that has not arrived.
 */
export function useQuery<T>(path: string | null, deps: unknown[] = []): Query<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [initial, setInitial] = useState(true);

  // A ref, so `reload` is stable and does not re-trigger the effect
  // that calls it.
  const pathRef = useRef(path);
  pathRef.current = path;

  const run = useCallback(async (signal?: AbortSignal) => {
    const target = pathRef.current;
    if (!target) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await api.get<T>(target, signal);
      if (signal?.aborted) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setInitial(false);
      }
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void run(ac.signal);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, run, ...deps]);

  const reload = useCallback(() => run(), [run]);

  return { data, error, loading, initial, reload, set: setData };
}

export interface ListFilters {
  page: number;
  search: string;
  [key: string]: string | number | undefined;
}

export interface ListState<T> {
  items: T[];
  pagination: Paged<T>["pagination"] | null;
  error: string | null;
  loading: boolean;
  initial: boolean;
  filters: ListFilters;
  /** Patches filters; any change except `page` resets to page 1. */
  setFilter(patch: Record<string, string | number | undefined>): void;
  setPage(page: number): void;
  /** The search box's immediate value, before debouncing. */
  searchInput: string;
  setSearchInput(value: string): void;
  reload(): Promise<void>;
  /** True when any filter is narrowing the list. */
  filtered: boolean;
  clearFilters(): void;
}

/**
 * A paginated, searchable, filterable list.
 *
 * The search box is debounced so typing does not fire a request per
 * keystroke, and the committed value is kept separately from the input
 * so the field never fights the user.
 */
export function useList<T>(
  path: string,
  initialFilters: Record<string, string | number | undefined> = {},
  perPage = 20
): ListState<T> {
  const [filters, setFilters] = useState<ListFilters>({
    page: 1,
    search: "",
    ...initialFilters,
  });
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounced(searchInput, 300);

  useEffect(() => {
    setFilters((f) => (f.search === debouncedSearch ? f : { ...f, search: debouncedSearch, page: 1 }));
  }, [debouncedSearch]);

  const query = useMemo(() => {
    const { page, ...rest } = filters;
    return qs({ page, perPage, ...rest });
  }, [filters, perPage]);

  const { data, error, loading, initial, reload } = useQuery<Paged<T>>(`${path}${query}`);

  const setFilter = useCallback((patch: Record<string, string | number | undefined>) => {
    setFilters((f) => ({ ...f, ...patch, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setFilters((f) => ({ ...f, page }));
    // A page change that leaves the viewport scrolled halfway down a
    // table is disorienting.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const clearFilters = useCallback(() => {
    setSearchInput("");
    setFilters({ page: 1, search: "", ...initialFilters });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const defaults: Record<string, unknown> = { page: 1, search: "", ...initialFilters };
    return Object.entries(filters).some(
      ([k, v]) => k !== "page" && v !== "" && v !== undefined && v !== defaults[k]
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  return {
    items: data?.items ?? [],
    pagination: data?.pagination ?? null,
    error,
    loading,
    initial,
    filters,
    setFilter,
    setPage,
    searchInput,
    setSearchInput,
    reload,
    filtered,
    clearFilters,
  };
}

/**
 * Wraps a write so a screen never has to repeat the same
 * try/catch/toast/reload dance.
 *
 * Returns the error message rather than throwing, so a caller can
 * decide whether to show it inline or as a toast.
 */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(
      key: string,
      fn: () => Promise<T>
    ): Promise<{ ok: true; value: T } | { ok: false; error: string; fields: Record<string, string> }> => {
      setBusy(key);
      try {
        return { ok: true, value: await fn() };
      } catch (err) {
        if (err instanceof ApiError) {
          return { ok: false, error: err.message, fields: err.fieldErrors };
        }
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Something went wrong",
          fields: {},
        };
      } finally {
        setBusy(null);
      }
    },
    []
  );

  return { busy, isBusy: (key: string) => busy === key, run };
}

/**
 * Tracks a draft object against the value it was loaded from.
 *
 * Gives the editors a reliable `dirty` flag without each one writing
 * its own comparison, and a `reset` that goes back to the server's
 * version rather than to a blank form.
 */
export function useDraft<T>(source: T | null) {
  const [value, setValue] = useState<T | null>(source);
  const [baseline, setBaseline] = useState<T | null>(source);

  // Adopt a newly loaded record, but never clobber edits in progress.
  const sourceKey = useMemo(() => JSON.stringify(source ?? null), [source]);
  const adopted = useRef<string | null>(null);

  useEffect(() => {
    if (adopted.current === sourceKey) return;
    adopted.current = sourceKey;
    setValue(source);
    setBaseline(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  const dirty = useMemo(
    () => JSON.stringify(value ?? null) !== JSON.stringify(baseline ?? null),
    [value, baseline]
  );

  const update = useCallback((patch: Partial<T> | ((current: T) => T)) => {
    setValue((current) => {
      if (current === null) return current;
      return typeof patch === "function"
        ? (patch as (c: T) => T)(current)
        : { ...current, ...patch };
    });
  }, []);

  const reset = useCallback(() => setValue(baseline), [baseline]);

  /** Marks the current value as saved, so `dirty` goes false. */
  const commit = useCallback((saved?: T) => {
    setValue((current) => {
      const next = saved ?? current;
      setBaseline(next);
      adopted.current = JSON.stringify(next ?? null);
      return next;
    });
  }, []);

  return { value, setValue, update, dirty, reset, commit, baseline };
}
