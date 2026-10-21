import type { Unsubscribe } from '../helpers/observable';
import { ReactorObserver } from './observer';

/** Anything with a `type` discriminator: `{ type: 'Load' } | { type: 'Search'; query: string }`. */
export interface Action {
  readonly type: string;
}

/**
 * Declares a reactor's actions as an interface: action name -> payload (`void` for none).
 *
 * ```ts
 * interface ProductsAction {
 *   load: void;
 *   search: { query: string };
 * }
 * ```
 */
export type ActionMap = object;

/** `send.load()`, `send.search({ query })`: one method per action, typed by its payload. */
export type Sender<D> = {
  [K in keyof D]: [D[K]] extends [void] ? () => Promise<void> : (payload: D[K]) => Promise<void>;
};

/** `this.on.search((payload, ctx) => ...)`: registers the handler of one action. */
export type Registrar<S, D, F> = {
  [K in keyof D]: (handler: ReactorHandler<S, D, F, D[K]>, options?: HandlerOptions) => void;
};

export interface Subscribable<T> {
  subscribe(listener: (value: T) => void): Unsubscribe;
}

/**
 * How overlapping actions of the same `type` are handled.
 * - `concurrent`: run all at once (default).
 * - `sequential`: queue; one at a time, in order.
 * - `restartable`: a new action cancels the previous one (search-as-you-type, refresh).
 * - `droppable`: ignore new actions while one is running (submit buttons).
 */
export type ActionTransformer = 'concurrent' | 'sequential' | 'restartable' | 'droppable';

export interface ReactorContext<S, D, F> {
  /** The current state. Always up to date, also after an `await`. */
  readonly state: S;
  /** Publishes a new state. Ignored once this handler was cancelled or the reactor disposed. */
  emit(next: S | ((current: S) => S)): void;
  /** Merges [partial] into the current state (object states): `ctx.patch({ loading: false })`. */
  patch(partial: Partial<S>): void;
  /** Sends a one-shot effect to the view (navigation, toast). Not stored in state. */
  effect(effect: F): void;
  /** True after a `restartable` replacement or disposal; check it after an `await` to stop early. */
  readonly isCancelled: boolean;
  /**
   * Subscribes to a stream (socket messages, a `ValueNotifier`, ...). The subscription
   * outlives the handler and is released when the reactor is disposed or the handler is restarted.
   */
  listen<T>(source: Subscribable<T>, onData: (value: T) => void): Unsubscribe;
  /** Dispatches another action: `ctx.send.refresh()`. */
  readonly send: Sender<D>;
}

/** What hooks and test helpers need from a reactor's state. Avoids variance trouble with `Reactor<S, A, never>`. */
export interface StateSource<S> {
  readonly state: S;
  subscribe(listener: (state: S) => void): Unsubscribe;
}

/** A reactor seen from outside: tools that save, restore or inspect state need no more than this. */
export interface HydratableSource<S> extends StateSource<S> {
  readonly isDisposed: boolean;
  hydrate(state: S): void;
}

export interface EffectSource<F> {
  readonly effects: Subscribable<F>;
}

export type ReactorHandler<S, D, F, P> = (
  payload: P,
  context: ReactorContext<S, D, F>,
) => void | Promise<void>;

export interface RetryOptions {
  /** Extra attempts after the first failure. */
  times: number;
  /** Wait before each retry; doubles every attempt when [backoff] is set. Default 0. */
  delayMs?: number;
  backoff?: boolean;
  /** Return false to give up at once for errors that retrying cannot fix. */
  shouldRetry?(error: unknown): boolean;
}

export interface HandlerOptions {
  transformer?: ActionTransformer;
  /** Re-runs the handler when it throws (use for idempotent loads, not for payments). */
  retry?: RetryOptions;
  /**
   * Maps an error that survived the retries to state or an effect. Handled errors still go
   * to `ReactorObserver.onError` but no longer reach the reactor's `onError`.
   */
  onError?(error: unknown, context: ReactorContext<any, any, any>): void;
}

interface Run {
  cancelled: boolean;
  unsubscribes: Set<Unsubscribe>;
  cancel(): void;
}

interface Registration {
  handler: (payload: any, context: ReactorContext<any, any, any>) => void | Promise<void>;
  transformer: ActionTransformer;
  options: HandlerOptions;
  active: number;
  chain: Promise<void>;
  current?: Run;
}

function createRun(): Run {
  const run: Run = {
    cancelled: false,
    unsubscribes: new Set(),
    cancel() {
      run.cancelled = true;
      for (const off of [...run.unsubscribes]) off();
      run.unsubscribes.clear();
    },
  };
  return run;
}

/** Builds an object whose properties are created on demand, e.g. `send.load` and `this.on.load`. */
function methods<T>(make: (name: string) => unknown): T {
  return new Proxy(
    {},
    {
      get: (_, name) => (typeof name === 'string' && name !== 'then' ? make(name) : undefined),
    },
  ) as T;
}

/**
 * A state holder driven by actions: `action -> handler -> emit(State)`, plus one-shot
 * effects. The view only sees `state` and `send`.
 *
 * ```ts
 * interface CounterAction {
 *   increment: void;
 *   add: { by: number };
 * }
 *
 * class CounterReactor extends Reactor<{ count: number }, CounterAction> {
 *   constructor() {
 *     super({ count: 0 });
 *     this.on.increment((_, { emit }) => emit((s) => ({ count: s.count + 1 })));
 *     this.on.add(({ by }, { emit }) => emit((s) => ({ count: s.count + by })));
 *   }
 * }
 *
 * reactor.send.increment();
 * reactor.send.add({ by: 5 });
 * ```
 *
 * The constructor must not do I/O (React may create a reactor twice in development);
 * start work by sending an action after mount.
 */
export abstract class Reactor<S, D extends ActionMap, F = never> {
  private _state: S;
  private _disposed = false;
  private readonly stateListeners = new Set<(state: S) => void>();
  private readonly effectListeners = new Set<(effect: F) => void>();
  private readonly registrations = new Map<string, Registration>();
  private readonly runs = new Set<Run>();
  private readonly owned: { dispose(): void }[] = [];

  /** One-shot effects for the view. Effects emitted while nobody listens are dropped. */
  readonly effects: Subscribable<F> = {
    subscribe: (listener) => {
      this.effectListeners.add(listener);
      return () => {
        this.effectListeners.delete(listener);
      };
    },
  };

  /**
   * Dispatches an action: `send.search({ query })`. The returned promise settles when the
   * handler finishes (useful for pull-to-refresh and tests); the view can ignore it.
   */
  readonly send: Sender<D> = methods((name) => (payload?: unknown) => this.dispatch(name, payload));

  /** Registers the handler of an action: `this.on.search(...)`. Call from the constructor. */
  protected readonly on: Registrar<S, D, F> = methods(
    (name) =>
      (handler: Registration['handler'], options: HandlerOptions = {}) => {
        this.registrations.set(name, {
          handler,
          transformer: options.transformer ?? 'concurrent',
          options,
          active: 0,
          chain: Promise.resolve(),
        });
      },
  );

  constructor(initialState: S) {
    this._state = initialState;
    ReactorObserver.current?.onCreate?.(this);
  }

  get state(): S {
    return this._state;
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  /** Subscribes to state changes. Compatible with `useSyncExternalStore`. */
  subscribe = (listener: (state: S) => void): Unsubscribe => {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  };

  /**
   * Replaces the state from outside the action flow: restoring a saved session, time travel
   * in devtools, tests. Observers see it as the action `@@hydrate`. Ignored once disposed.
   */
  hydrate(state: S): void {
    if (this._disposed) return;
    this.setState(state, { type: '@@hydrate' });
  }

  /** Stops all work, releases `listen` subscriptions and drops every listener. Idempotent. */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    for (const run of [...this.runs]) run.cancel();
    this.runs.clear();
    // Children first, in reverse order of ownership, so a child never outlives what it reports to.
    for (const child of this.owned.splice(0).reverse()) child.dispose();
    this.onDispose();
    this.stateListeners.clear();
    this.effectListeners.clear();
    ReactorObserver.current?.onDispose?.(this);
  }

  /**
   * Takes ownership of a child (another reactor, or anything with `dispose()`): it is disposed
   * with this reactor. Follow its state with `ctx.listen(child, ...)`, drive it with
   * `child.send.action()`. Use it for a flow that is made of several reactors.
   *
   * Only own what this reactor creates. A shared reactor (such as the app's session) belongs to
   * its container and must not be owned.
   */
  protected own<C extends { dispose(): void }>(child: C): C {
    if (this._disposed) child.dispose();
    else this.owned.push(child);
    return child;
  }

  /** Called with errors thrown by handlers. The default logs; override to map them to state. */
  protected onError(error: unknown, action: Action): void {
    console.error(`[Reactor] ${this.constructor.name} failed on "${action.type}"`, error);
  }

  /** Release resources the subclass owns. */
  protected onDispose(): void {}

  private dispatch(name: string, payload: unknown): Promise<void> {
    if (this._disposed) return Promise.resolve();
    const action: Action = { ...(payload as object | undefined), type: name };
    ReactorObserver.current?.onAction?.(this, action);
    const registration = this.registrations.get(name);
    if (!registration) return Promise.resolve();

    switch (registration.transformer) {
      case 'droppable':
        if (registration.active > 0) return Promise.resolve();
        break;
      case 'restartable':
        registration.current?.cancel();
        break;
      case 'sequential': {
        const next = registration.chain.then(() => this.run(registration, payload, action));
        registration.chain = next;
        return next;
      }
    }
    return this.run(registration, payload, action);
  }

  private async run(registration: Registration, payload: unknown, action: Action): Promise<void> {
    if (this._disposed) return;
    const run = createRun();
    this.runs.add(run);
    registration.current = run;
    registration.active++;
    const context = this.createContext(run, action);
    try {
      await this.attempt(registration, payload, context, run);
    } catch (error) {
      const handler = registration.options.onError;
      if (handler && !run.cancelled && !this._disposed) {
        ReactorObserver.current?.onError?.(this, error, action);
        try {
          handler(error, context);
        } catch (inner) {
          this.report(inner, action);
        }
      } else {
        this.report(error, action);
      }
    } finally {
      registration.active--;
      // `current` stays set after completion: a restart must also release the `listen`
      // subscriptions of the previous run, which outlive its handler.
      // A finished handler with no live subscriptions has nothing left to cancel.
      if (run.unsubscribes.size === 0) this.runs.delete(run);
    }
  }

  private async attempt(
    registration: Registration,
    payload: unknown,
    context: ReactorContext<any, any, any>,
    run: Run,
  ): Promise<void> {
    const retry = registration.options.retry;
    for (let attempt = 0; ; attempt++) {
      try {
        await registration.handler(payload, context);
        return;
      } catch (error) {
        const exhausted = !retry || attempt >= retry.times;
        if (exhausted || run.cancelled || this._disposed) throw error;
        if (retry.shouldRetry && !retry.shouldRetry(error)) throw error;
        const delay = (retry.delayMs ?? 0) * (retry.backoff ? 2 ** attempt : 1);
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        if (run.cancelled || this._disposed) return;
      }
    }
  }

  private createContext(run: Run, action: Action): ReactorContext<S, D, F> {
    const alive = () => !run.cancelled && !this._disposed;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      get state() {
        return self._state;
      },
      get isCancelled() {
        return !alive();
      },
      emit: (next) => {
        if (!alive()) return;
        this.setState(
          typeof next === 'function' ? (next as (current: S) => S)(this._state) : next,
          action,
        );
      },
      patch: (partial) => {
        if (!alive()) return;
        this.setState({ ...this._state, ...partial }, action);
      },
      effect: (effect) => {
        if (!alive()) return;
        for (const listener of [...this.effectListeners]) listener(effect);
      },
      listen: (source, onData) => {
        if (!alive()) return () => {};
        const off = source.subscribe((value) => {
          if (!alive()) return;
          try {
            onData(value);
          } catch (error) {
            this.report(error, action);
          }
        });
        const release = () => {
          off();
          run.unsubscribes.delete(release);
        };
        run.unsubscribes.add(release);
        this.runs.add(run);
        return release;
      },
      send: this.send,
    };
  }

  private setState(next: S, action: Action): void {
    if (Object.is(next, this._state)) return;
    const current = this._state;
    ReactorObserver.current?.onTransition?.(this, { action, current, next });
    this._state = next;
    for (const listener of [...this.stateListeners]) listener(next);
  }

  private report(error: unknown, action: Action): void {
    ReactorObserver.current?.onError?.(this, error, action);
    this.onError(error, action);
  }
}
