import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { ActionMap, EffectSource, Reactor, Sender, StateSource } from './reactor';

/**
 * Re-renders when the selected part of the state changes.
 * An object-returning selector needs `isEqual` (e.g. `shallowEqual`), otherwise every
 * state change re-renders.
 */
export function useReactorState<S, R = S>(
  reactor: StateSource<S>,
  select: (state: S) => R = (state) => state as unknown as R,
  isEqual: (a: R, b: R) => boolean = Object.is,
): R {
  const cache = useRef<{
    state: S;
    select: (state: S) => R;
    selected: R;
  } | null>(null);

  const subscribe = useCallback(
    (onChange: () => void) => reactor.subscribe(() => onChange()),
    [reactor],
  );
  const getSnapshot = (): R => {
    const state = reactor.state;
    const cached = cache.current;
    if (cached && cached.state === state && cached.select === select) return cached.selected;
    const selected = select(state);
    const stable = cached && isEqual(cached.selected, selected) ? cached.selected : selected;
    cache.current = { state, select, selected: stable };
    return stable;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * The hook a view uses: `const [state, send] = useReactor(reactor)`.
 * Pass a selector to subscribe to a slice only.
 */
export function useReactor<S, D extends ActionMap, F, R = S>(
  reactor: Reactor<S, D, F>,
  select?: (state: S) => R,
  isEqual?: (a: R, b: R) => boolean,
): readonly [R, Sender<D>] {
  const selected = useReactorState(reactor, select, isEqual);
  return [selected, reactor.send] as const;
}

/** Runs [listener] for every one-shot effect: navigation, toasts, haptics. */
export function useReactorEffect<F>(reactor: EffectSource<F>, listener: (effect: F) => void): void {
  const latest = useRef(listener);
  latest.current = listener;
  useEffect(() => reactor.effects.subscribe((effect) => latest.current(effect)), [reactor]);
}

/**
 * Calls [listener] when the state changes (not for the initial state), optionally only
 * when [listenWhen] says so. For reactions that belong to the view, not to the reactor.
 */
export function useReactorListener<S>(
  reactor: StateSource<S>,
  listener: (state: S) => void,
  listenWhen?: (previous: S, current: S) => boolean,
): void {
  const latest = useRef({ listener, listenWhen });
  latest.current = { listener, listenWhen };

  useEffect(() => {
    let previous = reactor.state;
    return reactor.subscribe((current) => {
      const prior = previous;
      previous = current;
      if (latest.current.listenWhen?.(prior, current) ?? true) latest.current.listener(current);
    });
  }, [reactor]);
}
