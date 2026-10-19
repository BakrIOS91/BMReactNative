export type Unsubscribe = () => void;

/**
 * Minimal reactive value: the React Native counterpart of Flutter's
 * `ValueNotifier` / `ValueListenable`. Works with `useSyncExternalStore`.
 */
export interface Listenable<T> {
  readonly value: T;
  subscribe(listener: (value: T) => void): Unsubscribe;
}

export class ValueNotifier<T> implements Listenable<T> {
  private current: T;
  private listeners = new Set<(value: T) => void>();

  constructor(initial: T) {
    this.current = initial;
  }

  get value(): T {
    return this.current;
  }

  set value(next: T) {
    if (Object.is(next, this.current)) return;
    this.current = next;
    for (const listener of [...this.listeners]) listener(next);
  }

  subscribe(listener: (value: T) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.listeners.clear();
  }
}
