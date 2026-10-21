import type { ReactorObserverCallbacks } from './observer';
import { combineObservers, ReactorObserver } from './observer';
import type { Action, HydratableSource, Reactor } from './reactor';

export type HistoryEntry =
  | { kind: 'create'; at: number; reactor: Reactor<any, any, any>; name: string }
  | { kind: 'action'; at: number; reactor: Reactor<any, any, any>; name: string; action: Action }
  | {
      kind: 'transition';
      at: number;
      reactor: Reactor<any, any, any>;
      name: string;
      action: Action;
      current: unknown;
      next: unknown;
    }
  | {
      kind: 'error';
      at: number;
      reactor: Reactor<any, any, any>;
      name: string;
      action: Action;
      error: unknown;
    }
  | { kind: 'dispose'; at: number; reactor: Reactor<any, any, any>; name: string };

/**
 * A bounded in-memory log of everything reactors do, with time travel. Meant for debug
 * builds, QA menus and attaching "what happened" to a crash report.
 *
 * ```ts
 * const history = new ReactorHistory({ capacity: 500 });
 * history.attach();                      // becomes ReactorObserver.current
 * history.transitions(reactor);          // states in order
 * history.travel(reactor, 3);            // go back to the state before the 4th transition
 * ```
 */
export class ReactorHistory implements ReactorObserverCallbacks {
  private readonly log: HistoryEntry[] = [];
  private previous: ReactorObserverCallbacks | undefined;
  private attached = false;
  private traveling = false;
  readonly capacity: number;

  constructor(options: { capacity?: number; clock?: () => number } = {}) {
    this.capacity = options.capacity ?? 500;
    this.clock = options.clock ?? Date.now;
  }
  private readonly clock: () => number;

  get entries(): readonly HistoryEntry[] {
    return this.log;
  }

  /** Becomes the global observer. Any observer set before keeps receiving events. */
  attach(): void {
    if (this.attached) return;
    this.previous = ReactorObserver.current;
    this.attached = true;
    const next = this.previous ? combineObservers(this.previous, this) : this;
    ReactorObserver.current = next;
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    ReactorObserver.current = this.previous;
    this.previous = undefined;
  }

  clear(): void {
    this.log.length = 0;
  }

  /** The transitions of one reactor, oldest first. */
  transitions(reactor: HydratableSource<any>): Extract<HistoryEntry, { kind: 'transition' }>[] {
    return this.log.filter(
      (e): e is Extract<HistoryEntry, { kind: 'transition' }> =>
        e.kind === 'transition' && (e.reactor as unknown) === reactor,
    );
  }

  /**
   * Puts [reactor] back to the state before its [index]-th recorded transition (0 = the
   * first state this history saw). Pass `transitions(reactor).length` to return to the latest.
   */
  travel(reactor: HydratableSource<any>, index: number): void {
    const list = this.transitions(reactor);
    if (list.length === 0) return;
    const clamped = Math.max(0, Math.min(index, list.length));
    // Travelling is not an event of its own: recording it would shift the indexes.
    this.traveling = true;
    try {
      reactor.hydrate(clamped === list.length ? list[list.length - 1].next : list[clamped].current);
    } finally {
      this.traveling = false;
    }
  }

  /** A JSON-friendly copy, e.g. to attach to a bug report. */
  toJSON(): unknown[] {
    return this.log.map(({ reactor: _reactor, ...rest }) => ({
      ...rest,
      ...('error' in rest ? { error: String((rest as { error: unknown }).error) } : {}),
    }));
  }

  private push(entry: HistoryEntry): void {
    this.log.push(entry);
    if (this.log.length > this.capacity) this.log.splice(0, this.log.length - this.capacity);
  }

  private nameOf = (r: Reactor<any, any, any>) => r.constructor.name;

  onCreate = (reactor: Reactor<any, any, any>): void =>
    this.push({ kind: 'create', at: this.clock(), reactor, name: this.nameOf(reactor) });
  onAction = (reactor: Reactor<any, any, any>, action: Action): void =>
    this.push({ kind: 'action', at: this.clock(), reactor, name: this.nameOf(reactor), action });
  onTransition: ReactorObserverCallbacks['onTransition'] = (reactor, t) =>
    this.traveling ||
    this.push({
      kind: 'transition',
      at: this.clock(),
      reactor,
      name: this.nameOf(reactor),
      action: t.action,
      current: t.current,
      next: t.next,
    });
  onError = (reactor: Reactor<any, any, any>, error: unknown, action: Action): void =>
    this.push({
      kind: 'error',
      at: this.clock(),
      reactor,
      name: this.nameOf(reactor),
      action,
      error,
    });
  onDispose = (reactor: Reactor<any, any, any>): void =>
    this.push({ kind: 'dispose', at: this.clock(), reactor, name: this.nameOf(reactor) });
}
