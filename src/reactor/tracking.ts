import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { ActionMap, Reactor, Sender, StateSource } from './reactor';

/** The part of the state a render read: a tree of property keys. */
interface Node {
  children: Map<PropertyKey, Node>;
  /** The value itself left the render (`unwrapTracked`), so its identity matters too. */
  identity: boolean;
  /** The render listed the keys of this object (`Object.keys`, spread, `in`). */
  keys: boolean;
}

const newNode = (): Node => ({ children: new Map(), keys: false, identity: false });

function isTrackable(value: unknown): value is object {
  if (typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return true;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const targets = new WeakMap<object, { target: object; node: Node }>();

/**
 * Returns the real object behind a tracked one (a no-op for any other value). Use it when
 * a part of the state leaves the component, e.g. as a prop of a `React.memo` child or
 * into a long-lived store, since the tracked copy changes identity on every render.
 */
export function unwrapTracked<T>(value: T): T {
  const tracked = targets.get(value as object);
  if (!tracked) return value;
  tracked.node.identity = true;
  return tracked.target as T;
}

/** Wraps [root] so that every property the caller reads is recorded in [tree]. */
function track<S extends object>(root: S, tree: Node, session: { recording: boolean }): S {
  const wrap = (target: object, node: Node): object => {
    const proxy = new Proxy(target, {
      get(object, key, receiver) {
        const value = Reflect.get(object, key, receiver);
        if (typeof key === 'symbol' || typeof value === 'function') return value;
        // Reads after the render (event handlers, timers) must not widen the subscription.
        if (!session.recording) return isTrackable(value) ? unwrapTracked(value) : value;
        let child = node.children.get(key);
        if (!child) node.children.set(key, (child = newNode()));
        return isTrackable(value) ? wrap(value, child) : value;
      },
      has(object, key) {
        if (session.recording) node.keys = true;
        return Reflect.has(object, key);
      },
      ownKeys(object) {
        if (session.recording) node.keys = true;
        return Reflect.ownKeys(object);
      },
    });
    targets.set(proxy, { target, node });
    return proxy;
  };
  return wrap(root, tree) as S;
}

function read(state: unknown, path: PropertyKey[]): unknown {
  let value: any = state;
  for (const key of path) {
    if (value === null || value === undefined) return undefined;
    value = value[key];
  }
  return value;
}

/**
 * True when something the render read has changed. Only leaves are compared by identity:
 * an object that was read *through* (`state.user.name`) is not itself compared, so a new
 * `user` object with the same `name` is not a change.
 */
function hasChanged(previous: unknown, next: unknown, node: Node, path: PropertyKey[]): boolean {
  if (node.keys) {
    const before = read(previous, path);
    const after = read(next, path);
    if (typeof before !== typeof after || before === null || after === null) return true;
    if (typeof before === 'object') {
      const a = Object.keys(before as object);
      const b = Object.keys(after as object);
      if (a.length !== b.length || a.some((key, i) => key !== b[i])) return true;
    }
  }
  if (node.identity && path.length > 0 && !Object.is(read(previous, path), read(next, path))) {
    return true;
  }
  if (node.children.size === 0) {
    // Only its keys were read: the keys check above is the whole comparison.
    if (node.keys) return false;
    return path.length > 0 && !Object.is(read(previous, path), read(next, path));
  }
  for (const [key, child] of node.children) {
    if (hasChanged(previous, next, child, [...path, key])) return true;
  }
  return false;
}

/**
 * Subscribes to the properties this component reads from the state, and nothing else.
 * Read the state as a plain object and the hook records what you used:
 *
 * ```tsx
 * const state = useReactorTrackedState(reactor);
 * return <Text>{state.user.name}</Text>; // re-renders only when user.name changes
 * ```
 *
 * Reads are recorded on each render, so conditional reads work. Do not hold on to the
 * returned object (or parts of it) beyond the render; see `unwrapTracked` for props of
 * memoized children.
 */
export function useReactorTrackedState<S extends object>(reactor: StateSource<S>): S {
  const tree = useRef<Node>(newNode());
  const rendered = useRef<{ reactor: StateSource<S>; state: S } | null>(null);

  // Every render shows the latest state; the snapshot only holds back changes that this
  // component did not read, so a property read for the first time is never stale.
  if (rendered.current?.reactor !== reactor) rendered.current = { reactor, state: reactor.state };
  else rendered.current.state = reactor.state;
  // Start recording afresh; the reads of this render rebuild the tree.
  tree.current = newNode();
  const session = { recording: true };
  const sessionRef = useRef<{ recording: boolean } | null>(null);
  if (sessionRef.current) sessionRef.current.recording = false; // the previous render's proxies stop recording
  sessionRef.current = session;
  useEffect(() => {
    session.recording = false;
  });

  const subscribe = useCallback(
    (onChange: () => void) => {
      const check = (next: S) => {
        const current = rendered.current!;
        if (current.state === next) return;
        if (hasChanged(current.state, next, tree.current, [])) {
          current.state = next;
          onChange();
        }
      };
      // A change between render and subscribe must not be missed.
      check(reactor.state);
      return reactor.subscribe(check);
    },
    [reactor],
  );
  const getSnapshot = () => rendered.current!.state;

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return track(state, tree.current, session);
}

/**
 * `useReactor` with automatic dependency tracking: `const [state, send] = useReactorTracked(reactor)`.
 * The component re-renders only when a property it actually read changes, with no selector
 * to write or `shallowEqual` to remember.
 */
export function useReactorTracked<S extends object, D extends ActionMap, F>(
  reactor: Reactor<S, D, F>,
): readonly [S, Sender<D>] {
  return [useReactorTrackedState(reactor), reactor.send] as const;
}
