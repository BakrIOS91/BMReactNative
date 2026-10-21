import { useEffect, useReducer, useRef } from 'react';

export interface Disposable {
  readonly isDisposed: boolean;
  dispose(): void;
}

/**
 * Creates an instance during render, disposes it on unmount, and survives React
 * StrictMode's simulated unmount / remount: when the effect finds the instance already
 * disposed it asks for a re-render, and the next render creates a fresh one. Creating
 * during render (not in the effect) matters for nesting: by then a parent that revived
 * its own instance (e.g. a DI scope) has published the new one through context.
 *
 * `create` runs during render (twice in StrictMode), so it must be free of side effects.
 * Put work such as sending a first action in `start`, which runs after mount.
 */
export function useOwned<T extends Disposable>(
  create: () => T,
  start?: (instance: T) => void,
  disposeOnUnmount = true,
): T {
  const ref = useRef<T | null>(null);
  const reviving = useRef(false);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const latestStart = useRef(start);
  latestStart.current = start;

  if (ref.current === null || reviving.current) {
    ref.current = create();
    reviving.current = false;
  }
  const instance = ref.current;

  useEffect(() => {
    if (instance.isDisposed) {
      reviving.current = true;
      rerender();
      return;
    }
    latestStart.current?.(instance);
    return () => {
      if (disposeOnUnmount) instance.dispose();
    };
  }, [instance, disposeOnUnmount]);

  return instance;
}
