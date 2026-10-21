import { createElement, StrictMode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import {
  Container,
  createReactorContext,
  createToken,
  DIProvider,
  DIScope,
  Reactor,
  Sender,
  shallowEqual,
  useReactor,
  useReactorEffect,
  useReactorListener,
  useReactorState,
  useReactorTracked,
  unwrapTracked,
} from '../src';

type S = { a: number; b: number };
interface A {
  incA: void;
  incB: void;
  toast: void;
}

class R extends Reactor<S, A, string> {
  constructor(readonly step = 1) {
    super({ a: 0, b: 0 });
    this.on.incA( (_, { emit }) => emit((s) => ({ ...s, a: s.a + step })));
    this.on.incB( (_, { emit }) => emit((s) => ({ ...s, b: s.b + step })));
    this.on.toast( (_, { effect }) => effect('hi'));
  }
}

const render = (el: any) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(el);
  });
  return t;
};

it('useReactor re-renders for the selected slice only', () => {
  const r = new R();
  let renders = 0;
  let send!: Sender<A>;
  function View() {
    const [a, s] = useReactor(r, (st) => st.a);
    send = s;
    renders++;
    return createElement('x', null, String(a));
  }
  const t = render(createElement(View));
  expect(renders).toBe(1);
  act(() => void send.incB());
  expect(renders).toBe(1);
  act(() => void send.incA());
  expect(renders).toBe(2);
  expect((t.toJSON() as any).children).toEqual(['1']);
});

it('object selectors need an isEqual to avoid extra renders', () => {
  const r = new R();
  let renders = 0;
  function View() {
    useReactorState(r, (st) => ({ a: st.a }), shallowEqual);
    renders++;
    return null;
  }
  render(createElement(View));
  act(() => void r.send.incB());
  expect(renders).toBe(1);
  act(() => void r.send.incA());
  expect(renders).toBe(2);
});

it('shallowEqual compares one level deep', () => {
  expect(shallowEqual({ a: 1 }, { a: 1 })).toBe(true);
  expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
  expect(shallowEqual({ a: 1 }, { b: 1 } as any)).toBe(false);
  expect(shallowEqual({ a: 1 }, { a: 1, b: 2 } as any)).toBe(false);
  expect(shallowEqual(1 as any, 2 as any)).toBe(false);
  expect(shallowEqual(null as any, {} as any)).toBe(false);
  expect(shallowEqual([1, 2], [1, 2])).toBe(true);
});

it('useReactorEffect and useReactorListener use the latest callbacks', () => {
  const r = new R();
  const effects: string[] = [];
  const states: number[] = [];
  function View({ tag }: { tag: string }) {
    useReactorEffect(r, (e) => effects.push(tag + e));
    useReactorListener(
      r,
      (s) => states.push(s.a),
      (prev, cur) => prev.a !== cur.a,
    );
    return null;
  }
  const t = render(createElement(View, { tag: '1' }));
  act(() => void r.send.toast());
  act(() => t.update(createElement(View, { tag: '2' })));
  act(() => void r.send.toast());
  act(() => void r.send.incB());
  act(() => void r.send.incA());
  expect(effects).toEqual(['1hi', '2hi']);
  expect(states).toEqual([1]);
});

describe('createReactorContext', () => {
  const Step = createToken<number>('Step');
  const { Provider, useReactor: useCtx } = createReactorContext<R>('R');

  it('creates from the container, starts after mount, disposes on unmount', () => {
    const container = new Container().registerValue(Step, 5);
    let reactor!: R;
    function View() {
      reactor = useCtx();
      const [s] = useReactor(reactor);
      return createElement('x', null, String(s.a));
    }
    const t = render(
      createElement(DIProvider, {
        container,
        children: createElement(Provider, {
          create: (c: Container) => new R(c.resolve(Step)),
          start: (r: R) => void r.send.incA(),
          children: createElement(View),
        }),
      }),
    );
    expect((t.toJSON() as any).children).toEqual(['5']);
    act(() => t.unmount());
    expect(reactor.isDisposed).toBe(true);
  });

  it('works without a DIProvider and does not dispose an injected reactor', () => {
    const injected = new R(2);
    function View() {
      const [s] = useReactor(useCtx());
      return createElement('x', null, String(s.a));
    }
    const t = render(createElement(Provider, { reactor: injected, children: createElement(View) }));
    act(() => t.unmount());
    expect(injected.isDisposed).toBe(false);
  });

  it('survives StrictMode double mount with a live reactor', () => {
    const created: R[] = [];
    let current!: R;
    function View() {
      current = useCtx();
      return null;
    }
    const t = render(
      createElement(StrictMode, null, createElement(Provider, {
        create: () => {
          const r = new R();
          created.push(r);
          return r;
        },
        start: (r: R) => void r.send.incA(),
        children: createElement(View),
      })),
    );
    expect(current.isDisposed).toBe(false);
    expect(current.state.a).toBe(1);
    act(() => t.unmount());
    expect(current.isDisposed).toBe(true);
  });

  it('survives StrictMode when nested inside a DI scope (child effect runs before the parent revives)', () => {
    const Feed = createToken<{ id: number }>('Feed');
    const root = new Container();
    let n = 0;
    root.register(Feed, () => ({ id: ++n }), { lifetime: 'scoped', dispose: () => {} });
    const disposedScopes: boolean[] = [];
    let current!: R;
    let usedFeedScopeDisposed: boolean | undefined;
    function View() {
      current = useCtx();
      return null;
    }
    const t = render(
      createElement(StrictMode, null, createElement(DIProvider, {
        container: root,
        children: createElement(DIScope, {
          children: createElement(Provider, {
            create: (c: Container) => {
              usedFeedScopeDisposed = c.isDisposed;
              disposedScopes.push(c.isDisposed);
              c.resolve(Feed);
              return new R();
            },
            start: (r: R) => void r.send.incA(),
            children: createElement(View),
          }),
        }),
      })),
    );
    expect(usedFeedScopeDisposed).toBe(false);
    expect(current.isDisposed).toBe(false);
    expect(current.state.a).toBe(1);
    act(() => t.unmount());
    expect(current.isDisposed).toBe(true);
  });

  it('throws helpful errors', () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    function View() {
      useCtx();
      return null;
    }
    expect(() => TestRenderer.create(createElement(View))).toThrow('Use RProvider');
    expect(() => TestRenderer.create(createElement(Provider, { children: null }))).toThrow('needs "create"');
    err.mockRestore();
  });
});

describe('tracking', () => {
  type T = { user: { name: string; age: number }; items: number[]; other: number };
  interface TA {
    setAge: { age: number };
    renameSame: void;
    push: void;
    bump: void;
  }
  class TR extends Reactor<T, TA> {
    constructor() {
      super({ user: { name: 'ann', age: 1 }, items: [1], other: 0 });
      this.on.setAge(({ age }, { emit }) => emit((s) => ({ ...s, user: { ...s.user, age } })));
      this.on.renameSame((_, { emit }) => emit((s) => ({ ...s, user: { ...s.user } })));
      this.on.push((_, { emit }) => emit((s) => ({ ...s, items: [...s.items, 2] })));
      this.on.bump((_, { emit }) => emit((s) => ({ ...s, other: s.other + 1 })));
    }
  }

  const setup = (read: (s: T) => unknown) => {
    const reactor = new TR();
    let renders = 0;
    let latest: unknown;
    const View = () => {
      const [state] = useReactorTracked(reactor);
      renders++;
      latest = read(state);
      return null;
    };
    render(createElement(View));
    return { reactor, renders: () => renders, latest: () => latest };
  };

  it('re-renders only for the properties that were read', async () => {
    const t = setup((s) => s.user.name);
    expect(t.renders()).toBe(1);
    await act(async () => void (await t.reactor.send.setAge({ age: 5 })));
    await act(async () => void (await t.reactor.send.bump()));
    expect(t.renders()).toBe(1);
  });

  it('ignores a new parent object with equal leaves', async () => {
    const t = setup((s) => s.user.name);
    await act(async () => void (await t.reactor.send.renameSame()));
    expect(t.renders()).toBe(1);
  });

  it('re-renders when a read leaf changes', async () => {
    const t = setup((s) => s.user.age);
    await act(async () => void (await t.reactor.send.setAge({ age: 9 })));
    expect(t.renders()).toBe(2);
    expect(t.latest()).toBe(9);
  });

  it('tracks arrays by length and items', async () => {
    const t = setup((s) => s.items.map((n) => n * 2));
    await act(async () => void (await t.reactor.send.push()));
    expect(t.renders()).toBe(2);
    expect(t.latest()).toEqual([2, 4]);
    await act(async () => void (await t.reactor.send.bump()));
    expect(t.renders()).toBe(2);
  });

  it('tracks a whole object read by identity, and key listing', async () => {
    const t = setup((s) => s.user);
    await act(async () => void (await t.reactor.send.setAge({ age: 2 })));
    expect(t.renders()).toBe(2);
    const keys = setup((s) => Object.keys(s.user));
    await act(async () => void (await keys.reactor.send.setAge({ age: 2 })));
    expect(keys.renders()).toBe(1);
  });

  it('sees a property read for the first time with the latest value', async () => {
    const reactor = new TR();
    let showOther = false;
    let seen = -1;
    const View = () => {
      const [state] = useReactorTracked(reactor);
      seen = showOther ? state.other : -1;
      return null;
    };
    const tree = render(createElement(View));
    await act(async () => void (await reactor.send.bump()));
    showOther = true;
    act(() => tree.update(createElement(View)));
    expect(seen).toBe(1);
  });

  it('compares an unwrapped value by identity even when it was also read through', async () => {
    const t = setup((s) => {
      const items = unwrapTracked(s.items);
      return [items, s.items.length];
    });
    await act(async () => void (await t.reactor.send.push()));
    expect(t.renders()).toBe(2);
  });

  it('survives StrictMode and unwraps to the real object', () => {
    const reactor = new TR();
    let raw: unknown;
    const View = () => {
      const [state] = useReactorTracked(reactor);
      raw = unwrapTracked(state.user);
      return null;
    };
    render(createElement(StrictMode, null, createElement(View)));
    expect(raw).toBe(reactor.state.user);
  });
});

describe('patch', () => {
  it('merges a partial into the state', async () => {
    class P extends Reactor<{ a: number; b: number }, { go: void }> {
      constructor() {
        super({ a: 0, b: 0 });
        this.on.go((_, { patch }) => patch({ b: 3 }));
      }
    }
    const p = new P();
    await p.send.go();
    expect(p.state).toEqual({ a: 0, b: 3 });
  });
});
