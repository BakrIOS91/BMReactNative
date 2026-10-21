import type { PreferencesStorage } from '../helpers/preferences/storage';
import type { HydratableSource } from './reactor';

export interface PersistOptions<S, P = S> {
  /** Storage key. */
  key: string;
  /** Bump when the saved shape changes; old data goes through [migrate] or is dropped. */
  version?: number;
  /** The part of the state worth saving (leave out loading flags, errors and secrets). */
  pick?(state: S): P;
  /** Combines the saved part with the current state. Default: shallow merge. */
  merge?(current: S, saved: P): S;
  /** Upgrades data saved under an older [version]; return undefined to drop it. */
  migrate?(saved: unknown, fromVersion: number): P | undefined;
  /** Wait this long after a change before writing, so bursts cost one write. Default 0. */
  debounceMs?: number;
  /** Receives storage and parse failures. They never throw into the reactor. */
  onError?(error: unknown): void;
}

export interface Persistence {
  /** Loads the saved part into the reactor. Resolves true when something was restored. */
  restore(): Promise<boolean>;
  /** Writes the current state now. */
  flush(): Promise<void>;
  /** Stops saving. */
  stop(): void;
  /** Removes the saved data. */
  clear(): Promise<void>;
}

/**
 * Saves a reactor's state and restores it later (a draft form, a selected tab, filters).
 * Do not persist tokens here: use secure storage for those.
 *
 * ```ts
 * const persistence = persistReactor(reactor, asyncStorageAdapter(), {
 *   key: 'filters', version: 1, pick: (s) => ({ query: s.query }),
 * });
 * await persistence.restore();
 * ```
 */
export function persistReactor<S, P = S>(
  reactor: HydratableSource<S>,
  storage: PreferencesStorage,
  options: PersistOptions<S, P>,
): Persistence {
  const version = options.version ?? 1;
  const pick = options.pick ?? ((state: S) => state as unknown as P);
  const merge = options.merge ?? ((current: S, saved: P) => ({ ...current, ...saved }) as S);
  const fail = (error: unknown) => options.onError?.(error);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let restoring = false;

  const write = async () => {
    try {
      await storage.setItem(options.key, JSON.stringify({ v: version, data: pick(reactor.state) }));
    } catch (error) {
      fail(error);
    }
  };

  const unsubscribe = reactor.subscribe(() => {
    if (restoring) return;
    if (!options.debounceMs) {
      void write();
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void write(), options.debounceMs);
  });

  return {
    async restore() {
      try {
        const raw = await storage.getItem(options.key);
        if (raw === null || reactor.isDisposed) return false;
        const parsed = JSON.parse(raw) as { v?: number; data?: unknown };
        const from = typeof parsed.v === 'number' ? parsed.v : 0;
        const saved = from === version ? (parsed.data as P) : options.migrate?.(parsed.data, from);
        if (saved === undefined || saved === null) {
          await storage.removeItem(options.key);
          return false;
        }
        restoring = true;
        try {
          reactor.hydrate(merge(reactor.state, saved));
        } finally {
          restoring = false;
        }
        return true;
      } catch (error) {
        fail(error);
        return false;
      }
    },
    async flush() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      await write();
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      unsubscribe();
    },
    async clear() {
      try {
        await storage.removeItem(options.key);
      } catch (error) {
        fail(error);
      }
    },
  };
}
