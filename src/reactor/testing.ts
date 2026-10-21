import type { EffectSource, StateSource } from './reactor';

/** Records every state a reactor publishes, starting with the current one. */
export function recordStates<S>(reactor: StateSource<S>): {
  states: S[];
  stop(): void;
} {
  const states: S[] = [reactor.state];
  const stop = reactor.subscribe((state) => states.push(state));
  return { states, stop };
}

/** Resolves with the first state (current or future) that satisfies [predicate]. */
export function waitForState<S>(
  reactor: StateSource<S>,
  predicate: (state: S) => boolean,
  timeoutMs = 1000,
): Promise<S> {
  if (predicate(reactor.state)) return Promise.resolve(reactor.state);
  return new Promise<S>((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(
        new Error(
          `waitForState timed out after ${timeoutMs}ms; last state: ${JSON.stringify(reactor.state)}`,
        ),
      );
    }, timeoutMs);
    const off = reactor.subscribe((state) => {
      if (!predicate(state)) return;
      clearTimeout(timer);
      off();
      resolve(state);
    });
  });
}

/** Collects the effects a reactor emits. */
export function recordEffects<F>(reactor: EffectSource<F>): {
  effects: F[];
  stop(): void;
} {
  const effects: F[] = [];
  const stop = reactor.effects.subscribe((effect) => effects.push(effect));
  return { effects, stop };
}
