import type { Action, Reactor } from './reactor';

/** One state change and the action that caused it. */
export interface ReactorTransition<S, A extends Action = Action> {
  action: A;
  current: S;
  next: S;
}

/** Global hooks into every reactor: logging, analytics, crash reporting, devtools. */
export interface ReactorObserverCallbacks {
  onCreate?(reactor: Reactor<any, any, any>): void;
  onAction?(reactor: Reactor<any, any, any>, action: Action): void;
  onTransition?(reactor: Reactor<any, any, any>, transition: ReactorTransition<any>): void;
  onError?(reactor: Reactor<any, any, any>, error: unknown, action: Action): void;
  onDispose?(reactor: Reactor<any, any, any>): void;
}

export const ReactorObserver: {
  current: ReactorObserverCallbacks | undefined;
} = { current: undefined };

/** Logs every action, transition and error. Assign to `ReactorObserver.current` in development. */
export const consoleReactorObserver: ReactorObserverCallbacks = {
  onCreate: (r) => console.log(`[Reactor] + ${r.constructor.name}`),
  onAction: (r, a) => console.log(`[Reactor] ${r.constructor.name} <- ${a.type}`, a),
  onTransition: (r, t) =>
    console.log(`[Reactor] ${r.constructor.name} (${t.action.type})`, t.current, '->', t.next),
  onError: (r, e, a) => console.warn(`[Reactor] ${r.constructor.name} failed on ${a.type}`, e),
  onDispose: (r) => console.log(`[Reactor] - ${r.constructor.name}`),
};

/** Runs several observers as one: `ReactorObserver.current = combineObservers(history, analytics)`. */
export function combineObservers(
  ...observers: ReactorObserverCallbacks[]
): ReactorObserverCallbacks {
  const each = (call: (observer: ReactorObserverCallbacks) => void) => {
    for (const observer of observers) {
      try {
        call(observer);
      } catch (error) {
        console.error('[Reactor] observer failed', error);
      }
    }
  };
  return {
    onCreate: (r) => each((o) => o.onCreate?.(r)),
    onAction: (r, a) => each((o) => o.onAction?.(r, a)),
    onTransition: (r, t) => each((o) => o.onTransition?.(r, t)),
    onError: (r, e, a) => each((o) => o.onError?.(r, e, a)),
    onDispose: (r) => each((o) => o.onDispose?.(r)),
  };
}
