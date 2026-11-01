import { useCallback, useEffect, useState } from 'react';
import type { LogEntry, SavedMeal } from '../lib/types.ts';

/** Local calendar date, YYYY-MM-DD (the user's own day, not UTC). */
export function todayKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // private mode / quota
  }
}

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now() + Math.random());

export function useDayLog() {
  const [day, setDay] = useState<string>(todayKey());
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [persistOk, setPersistOk] = useState(true);

  useEffect(() => {
    setEntries(read<LogEntry[]>(`tl:log:${day}`, []));
    setReady(true);
  }, [day]);

  // roll over at midnight if the tab stays open
  useEffect(() => {
    const t = setInterval(() => setDay((d) => (todayKey() !== d ? todayKey() : d)), 60_000);
    return () => clearInterval(t);
  }, []);

  const commit = useCallback(
    (next: LogEntry[]) => {
      setEntries(next);
      setPersistOk(write(`tl:log:${day}`, next));
    },
    [day],
  );

  const add = useCallback(
    (e: Omit<LogEntry, 'id' | 'addedAt'>) => commit([...entries, { ...e, id: uid(), addedAt: Date.now() }]),
    [entries, commit],
  );
  const addMany = useCallback(
    (list: Omit<LogEntry, 'id' | 'addedAt'>[]) =>
      commit([...entries, ...list.map((e) => ({ ...e, id: uid(), addedAt: Date.now() }))]),
    [entries, commit],
  );
  const remove = useCallback((id: string) => commit(entries.filter((e) => e.id !== id)), [entries, commit]);
  const clear = useCallback(() => commit([]), [commit]);

  return { day, entries, ready, persistOk, add, addMany, remove, clear };
}

export function useSavedMeals() {
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  useEffect(() => setMeals(read<SavedMeal[]>('tl:meals', [])), []);

  const save = useCallback(
    (name: string, entries: LogEntry[]) => {
      const meal: SavedMeal = {
        id: uid(),
        name: name.trim().slice(0, 40) || 'My meal',
        entries: entries.map(({ id, addedAt, ...rest }) => rest),
      };
      const next = [...meals, meal];
      setMeals(next);
      write('tl:meals', next);
    },
    [meals],
  );
  const remove = useCallback(
    (id: string) => {
      const next = meals.filter((m) => m.id !== id);
      setMeals(next);
      write('tl:meals', next);
    },
    [meals],
  );
  return { meals, save, remove };
}
