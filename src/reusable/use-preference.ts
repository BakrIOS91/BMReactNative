import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Listenable } from '../helpers/observable';

/** Re-renders with the current value of a preference (or any `Listenable`). */
export function usePreference<T>(source: Listenable<T>): T {
  return useSyncExternalStore(
    (onChange) => source.subscribe(onChange),
    () => source.value,
    () => source.value,
  );
}

/**
 * Calls [listener] when [source] changes (not for the initial value), the hook
 * form of BMFlutter's `preferencesListener`. Typical use: logging out when the
 * token preference becomes `null`.
 */
export function usePreferenceListener<T>(
  source: Listenable<T>,
  listener: (value: T) => void,
  listenWhen?: (previous: T, current: T) => boolean,
): void {
  const latest = useRef({ listener, listenWhen });
  latest.current = { listener, listenWhen };

  useEffect(() => {
    let previous = source.value;
    return source.subscribe((current) => {
      const { listener: fn, listenWhen: when } = latest.current;
      const prior = previous;
      previous = current;
      if (when?.(prior, current) ?? true) fn(current);
    });
  }, [source]);
}
