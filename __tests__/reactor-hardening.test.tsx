import { createElement, memo, StrictMode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import {
  combineObservers,
  MemoryStorage,
  persistReactor,
  Reactor,
  ReactorHistory,
  ReactorObserver,
  recordStates,
  retryAsync,
  singleFlight,
  unwrapTracked,
  useReactorTracked,
  useReactorState,
  createReactorContext,
} from '../src';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const render = (el: any) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(el);
  });
  return t;
};

// Deterministic PRNG so a failing run can be reproduced from its seed.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

afterEach(() => {
  ReactorObserver.current = undefined;
});

describe('errors', () => {
  interface A {
    load: void;
  }
  class R extends Reactor<{ n: number; error?: string }, A> {
    calls = 0;
    constructor(opts: ConstructorParameters<typeof Object>[0] | any) {
      super({ n: 0 });
      this.on.load(async (_, { emit }) => {
        this.calls++;
        if (this.calls <= opts.failFirst) throw new Error(`boom ${this.calls}`);
        emit({ n: this.calls });
      }, opts.handler);
    }
  }

  it('retries a throwing handler and succeeds', async () => {
    const r = new R({ failFirst: 2, handler: { retry: { times: 3 } } });
    await r.send.load();
    expect(r.calls).toBe(3);
    expect(r.state.n).toBe(3);
  });

  it('gives up after the retries and maps the error to state', async () => {
    const seen: unknown[] = [];
    const r = new R({
      failFirst: 99,
      handler: {
        retry: { times: 2 },
        onError: (e: unknown, ctx: any) => {
          seen.push(e);
          ctx.emit({ n: -1, error: (e as Error).message });
        },
      },
    });
    await r.send.load();
    expect(r.calls).toBe(3);
    expect(r.state).toEqual({ n: -1, error: 'boom 3' });
    expect(seen).toHaveLength(1);
  });

  it('honours shouldRetry and does not retry after dispose', async () => {
    const r = new R({
      failFirst: 99,
      handler: { retry: { times: 5, shouldRetry: () => false }, onError: () => {} },
    });
    await r.send.load();
    expect(r.calls).toBe(1);

    const slow = new R({
      failFirst: 99,
      handler: { retry: { times: 5, delayMs: 20 }, onError: () => {} },
    });
    const done = slow.send.load();
    await sleep(5);
    slow.dispose();
    await done;
    expect(slow.calls).toBe(1);
  });

  it('reports to the observer and the reactor when no onError is given', async () => {
    const errors: unknown[] = [];
    ReactorObserver.current = { onError: (_r, e) => errors.push(e) };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const r = new R({ failFirst: 1, handler: {} });
    await r.send.load();
    expect(errors).toHaveLength(1);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('a throwing onError is reported, not rethrown', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const r = new R({
      failFirst: 1,
      handler: {
        onError: () => {
          throw new Error('inner');
        },
      },
    });
    await expect(r.send.load()).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe('retryAsync and singleFlight', () => {
  it('retries until the value is accepted', async () => {
    let n = 0;
    const value = await retryAsync(async () => ++n, { times: 5, until: (v) => v >= 3 });
    expect(value).toBe(3);
  });

  it('returns the last value when attempts run out, and rethrows errors', async () => {
    expect(await retryAsync(async () => 1, { times: 2, until: () => false })).toBe(1);
    await expect(
      retryAsync(
        async () => {
          throw new Error('x');
        },
        { times: 1 },
      ),
    ).rejects.toThrow('x');
  });

  it('stops when cancelled', async () => {
    let n = 0;
    await retryAsync(async () => ++n, { times: 9, until: () => false, isCancelled: () => n >= 2 });
    expect(n).toBe(2);
  });

  it('shares one run between concurrent callers and runs again afterwards', async () => {
    let runs = 0;
    const refresh = singleFlight(async () => {
      runs++;
      await sleep(5);
      return runs;
    });
    const results = await Promise.all([refresh(), refresh(), refresh()]);
    expect(results).toEqual([1, 1, 1]);
    expect(await refresh()).toBe(2);
  });

  it('is released after a failure', async () => {
    let fail = true;
    const f = singleFlight(async () => {
      if (fail) throw new Error('no');
      return 'ok';
    });
    await expect(f()).rejects.toThrow('no');
    fail = false;
    await expect(f()).resolves.toBe('ok');
  });

  // The scenario that matters: many requests get a 401 together, one refresh serves them all.
  it('serialises a token refresh race', async () => {
    let token = 'old';
    let refreshes = 0;
    const refresh = singleFlight(async () => {
      refreshes++;
      await sleep(10);
      token = 'new';
    });
    const request = async () => {
      if (token === 'old') await refresh();
      return token;
    };
    expect(await Promise.all(Array.from({ length: 20 }, request))).toEqual(Array(20).fill('new'));
    expect(refreshes).toBe(1);
  });
});

describe('hydrate and persistence', () => {
  interface A {
    set: { n: number };
  }
  class R extends Reactor<{ n: number; busy: boolean }, A> {
    constructor() {
      super({ n: 0, busy: false });
      this.on.set(({ n }, { patch }) => patch({ n }));
    }
  }

  it('hydrate publishes and notifies observers; disposed reactors ignore it', () => {
    const actions: string[] = [];
    ReactorObserver.current = { onTransition: (_r, t) => actions.push(t.action.type) };
    const r = new R();
    r.hydrate({ n: 5, busy: false });
    expect(r.state.n).toBe(5);
    expect(actions).toEqual(['@@hydrate']);
    r.dispose();
    r.hydrate({ n: 9, busy: false });
    expect(r.state.n).toBe(5);
  });

  it('saves a picked part and restores it into a new reactor', async () => {
    const storage = new MemoryStorage();
    const opts = { key: 'k', pick: (s: { n: number }) => ({ n: s.n }) };
    const a = new R();
    const pa = persistReactor(a, storage, opts);
    await a.send.set({ n: 7 });
    await pa.flush();
    pa.stop();

    const b = new R();
    const pb = persistReactor(b, storage, opts);
    expect(await pb.restore()).toBe(true);
    expect(b.state).toEqual({ n: 7, busy: false });
    pb.stop();
  });

  it('restoring does not write back, and an empty store restores nothing', async () => {
    const storage = new MemoryStorage();
    const set = jest.spyOn(storage, 'setItem');
    const r = new R();
    const p = persistReactor(r, storage, { key: 'k' });
    expect(await p.restore()).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });

  it('migrates old versions and drops data it cannot migrate', async () => {
    const storage = new MemoryStorage();
    await storage.setItem('k', JSON.stringify({ v: 1, data: { count: 4 } }));
    const r = new R();
    const p = persistReactor(r, storage, {
      key: 'k',
      version: 2,
      migrate: (old, from) => (from === 1 ? { n: (old as { count: number }).count } : undefined),
    });
    expect(await p.restore()).toBe(true);
    expect(r.state.n).toBe(4);

    await storage.setItem('k', JSON.stringify({ v: 0, data: {} }));
    expect(await p.restore()).toBe(false);
    expect(await storage.getItem('k')).toBeNull();
  });

  it('survives corrupt data and storage failures', async () => {
    const errors: unknown[] = [];
    const storage = new MemoryStorage();
    await storage.setItem('k', '{not json');
    const r = new R();
    const p = persistReactor(r, storage, { key: 'k', onError: (e) => errors.push(e) });
    expect(await p.restore()).toBe(false);
    jest.spyOn(storage, 'setItem').mockRejectedValue(new Error('disk full'));
    await r.send.set({ n: 1 });
    await sleep(0);
    expect(errors).toHaveLength(2);
    p.stop();
  });

  it('debounces bursts into one write', async () => {
    const storage = new MemoryStorage();
    const set = jest.spyOn(storage, 'setItem');
    const r = new R();
    const p = persistReactor(r, storage, { key: 'k', debounceMs: 10 });
    for (let n = 1; n <= 5; n++) await r.send.set({ n });
    await sleep(30);
    expect(set).toHaveBeenCalledTimes(1);
    await p.clear();
    expect(await storage.getItem('k')).toBeNull();
    p.stop();
  });
});

describe('history', () => {
  interface A {
    inc: void;
  }
  class R extends Reactor<{ n: number }, A> {
    constructor() {
      super({ n: 0 });
      this.on.inc((_, { emit }) => emit((s) => ({ n: s.n + 1 })));
    }
  }

  it('records and time-travels', async () => {
    const history = new ReactorHistory();
    history.attach();
    const r = new R();
    for (let i = 0; i < 3; i++) await r.send.inc();
    expect(history.transitions(r).map((t) => (t.next as { n: number }).n)).toEqual([1, 2, 3]);
    history.travel(r, 1);
    expect(r.state.n).toBe(1);
    history.travel(r, 0);
    expect(r.state.n).toBe(0);
    history.travel(r, 99);
    expect(r.state.n).toBe(3);
    history.detach();
  });

  it('is bounded, chainable with other observers and serialisable', async () => {
    const seen: string[] = [];
    ReactorObserver.current = { onAction: (_r, a) => seen.push(a.type) };
    const history = new ReactorHistory({ capacity: 4, clock: () => 1 });
    history.attach();
    const r = new R();
    for (let i = 0; i < 5; i++) await r.send.inc();
    expect(seen).toHaveLength(5);
    expect(history.entries).toHaveLength(4);
    expect(JSON.parse(JSON.stringify(history)).length).toBe(4);
    history.detach();
    expect(ReactorObserver.current).toEqual(
      expect.objectContaining({ onAction: expect.any(Function) }),
    );
    history.clear();
    expect(history.entries).toHaveLength(0);
  });

  it('combineObservers isolates a failing observer', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const seen: string[] = [];
    ReactorObserver.current = combineObservers(
      {
        onAction: () => {
          throw new Error('bad');
        },
      },
      { onAction: (_r, a) => seen.push(a.type) },
    );
    await new R().send.inc();
    expect(seen).toEqual(['inc']);
    spy.mockRestore();
  });
});

describe('concurrency under load', () => {
  interface A {
    search: { q: string; ms: number };
    queue: { id: number; ms: number };
    submit: { ms: number };
    fetch: { ms: number };
  }
  class R extends Reactor<{ last: string; order: number[]; submits: number; fetches: number }, A> {
    constructor() {
      super({ last: '', order: [], submits: 0, fetches: 0 });
      this.on.search(
        async ({ q, ms }, ctx) => {
          await sleep(ms);
          if (ctx.isCancelled) return;
          ctx.emit((s) => ({ ...s, last: q }));
        },
        { transformer: 'restartable' },
      );
      this.on.queue(
        async ({ id, ms }, ctx) => {
          await sleep(ms);
          ctx.emit((s) => ({ ...s, order: [...s.order, id] }));
        },
        { transformer: 'sequential' },
      );
      this.on.submit(
        async ({ ms }, ctx) => {
          await sleep(ms);
          ctx.emit((s) => ({ ...s, submits: s.submits + 1 }));
        },
        { transformer: 'droppable' },
      );
      this.on.fetch(async ({ ms }, ctx) => {
        await sleep(ms);
        ctx.emit((s) => ({ ...s, fetches: s.fetches + 1 }));
      });
    }
  }

  for (const seed of [1, 2, 3, 4, 5]) {
    it(`keeps its guarantees under a random storm (seed ${seed})`, async () => {
      const random = rng(seed);
      const r = new R();
      const sent: number[] = [];
      let lastSearch = '';
      const jobs: Promise<void>[] = [];
      for (let i = 0; i < 60; i++) {
        const ms = Math.floor(random() * 6);
        switch (Math.floor(random() * 4)) {
          case 0:
            lastSearch = `q${i}`;
            jobs.push(r.send.search({ q: lastSearch, ms }));
            break;
          case 1:
            sent.push(i);
            jobs.push(r.send.queue({ id: i, ms }));
            break;
          case 2:
            jobs.push(r.send.submit({ ms }));
            break;
          default:
            jobs.push(r.send.fetch({ ms }));
        }
        if (random() < 0.3) await sleep(random() * 4);
      }
      await Promise.all(jobs);
      expect(r.state.last === '' || r.state.last === lastSearch).toBe(true); // only the newest search wins
      expect(r.state.order).toEqual(sent); // sequential keeps the order
      expect(r.state.submits).toBeGreaterThan(0);
    });
  }

  it('dispose during in-flight work emits nothing afterwards', async () => {
    const r = new R();
    const { states } = recordStates(r);
    const jobs = [
      r.send.fetch({ ms: 10 }),
      r.send.queue({ id: 1, ms: 10 }),
      r.send.search({ q: 'x', ms: 10 }),
    ];
    r.dispose();
    await Promise.all(jobs);
    expect(states).toHaveLength(1);
  });

  it('a socket that reconnects mid-action keeps one live subscription', async () => {
    const listeners = new Set<(n: number) => void>();
    const socket = {
      subscribe: (l: (n: number) => void) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
    };
    const push = (n: number) => [...listeners].forEach((l) => l(n));
    interface SA {
      connect: void;
    }
    class S extends Reactor<{ last: number }, SA> {
      constructor() {
        super({ last: 0 });
        this.on.connect(
          (_, ctx) => {
            ctx.listen(socket, (n) => ctx.emit({ last: n }));
          },
          { transformer: 'restartable' },
        );
      }
    }
    const s = new S();
    for (let i = 0; i < 10; i++) await s.send.connect(); // reconnect storm
    expect(listeners.size).toBe(1);
    push(5);
    expect(s.state.last).toBe(5);
    s.dispose();
    expect(listeners.size).toBe(0);
  });
});

describe('tracking hardening', () => {
  type T = {
    map: Map<string, number>;
    tags: Set<string>;
    when: Date;
    n: number;
    deep: { a: { b: number } };
  };
  class Box {
    constructor(readonly v: number) {}
  }
  interface A {
    setMap: void;
    bump: void;
    deepB: { b: number };
    replaceBox: void;
  }
  class R extends Reactor<T & { box: Box }, A> {
    constructor() {
      super({
        map: new Map(),
        tags: new Set(),
        when: new Date(0),
        n: 0,
        deep: { a: { b: 1 } },
        box: new Box(1),
      });
      this.on.setMap((_, { emit }) => emit((s) => ({ ...s, map: new Map([['a', 1]]) })));
      this.on.bump((_, { emit }) => emit((s) => ({ ...s, n: s.n + 1 })));
      this.on.deepB(({ b }, { emit }) => emit((s) => ({ ...s, deep: { a: { b } } })));
      this.on.replaceBox((_, { emit }) => emit((s) => ({ ...s, box: new Box(2) })));
    }
  }

  const mount = (read: (s: R['state']) => unknown) => {
    const reactor = new R();
    let renders = 0;
    const View = () => {
      const [state] = useReactorTracked(reactor);
      renders++;
      read(state);
      return null;
    };
    render(createElement(StrictMode, null, createElement(View)));
    return { reactor, renders: () => renders };
  };

  it('treats Map, Set, Date and class instances as values compared by identity', async () => {
    const m = mount((s) => s.map.size); // a Map method call works on the real object
    const before = m.renders();
    await act(async () => void (await m.reactor.send.setMap()));
    expect(m.renders()).toBeGreaterThan(before);

    const c = mount((s) => s.box.v);
    const cb = c.renders();
    await act(async () => void (await c.reactor.send.replaceBox()));
    expect(c.renders()).toBeGreaterThan(cb);

    const unrelated = mount((s) => [s.when.getTime(), s.tags.size]);
    const ub = unrelated.renders();
    await act(async () => void (await unrelated.reactor.send.bump()));
    expect(unrelated.renders()).toBe(ub);
  });

  it('tracks deep paths', async () => {
    const t = mount((s) => s.deep.a.b);
    const before = t.renders();
    await act(async () => void (await t.reactor.send.deepB({ b: 1 }))); // new objects, same leaf
    expect(t.renders()).toBe(before);
    await act(async () => void (await t.reactor.send.deepB({ b: 2 })));
    expect(t.renders()).toBeGreaterThan(before);
  });

  it('reads outside of render do not widen the subscription', async () => {
    const reactor = new R();
    let renders = 0;
    let handler: () => number = () => 0;
    const View = () => {
      const [state] = useReactorTracked(reactor);
      renders++;
      handler = () => state.n; // read later, in an event handler
      return null;
    };
    render(createElement(View));
    expect(handler()).toBe(0);
    await act(async () => void (await reactor.send.bump()));
    expect(renders).toBe(1);
  });

  it('works with React.memo children when the value is unwrapped', async () => {
    const reactor = new R();
    let childRenders = 0;
    const Child = memo(({ deep }: { deep: T['deep'] }) => {
      childRenders++;
      return createElement('span', null, String(deep.a.b));
    });
    const View = () => {
      const [state] = useReactorTracked(reactor);
      return createElement(Child, { deep: unwrapTracked(state.deep) });
    };
    render(createElement(View));
    await act(async () => void (await reactor.send.bump())); // n not read: no render at all
    expect(childRenders).toBe(1);
  });

  // Property test: for random state changes, a tracking view must show exactly what a view
  // subscribed to the whole state shows.
  for (const seed of [11, 12, 13]) {
    it(`always shows the same output as a full subscription (seed ${seed})`, async () => {
      type F = { a: number; b: { c: number; d: number[] }; flag: boolean };
      interface FA {
        patch: Partial<F>;
        c: { c: number };
        push: { v: number };
      }
      class FR extends Reactor<F, FA> {
        constructor() {
          super({ a: 0, b: { c: 0, d: [] }, flag: false });
          this.on.patch((p, { emit }) => emit((s) => ({ ...s, ...p })));
          this.on.c(({ c }, { emit }) => emit((s) => ({ ...s, b: { ...s.b, c } })));
          this.on.push(({ v }, { emit }) =>
            emit((s) => ({ ...s, b: { ...s.b, d: [...s.b.d, v] } })),
          );
        }
      }
      const reactor = new FR();
      const out = { tracked: '', full: '' };
      const render1 = (s: F) =>
        s.flag ? `${s.a}|${s.b.c}` : `${s.b.d.map((n) => n * 2).join(',')}`;
      const Tracked = () => {
        const [s] = useReactorTracked(reactor);
        out.tracked = render1(s);
        return null;
      };
      const Full = () => {
        const s = useReactorState(reactor);
        out.full = render1(s);
        return null;
      };
      render(createElement(StrictMode, null, createElement(Tracked), createElement(Full)));
      const random = rng(seed);
      for (let i = 0; i < 80; i++) {
        const pick = Math.floor(random() * 5);
        await act(async () => {
          if (pick === 0) await reactor.send.patch({ a: Math.floor(random() * 3) });
          else if (pick === 1) await reactor.send.patch({ flag: random() < 0.5 });
          else if (pick === 2) await reactor.send.c({ c: Math.floor(random() * 3) });
          else if (pick === 3) await reactor.send.push({ v: Math.floor(random() * 3) });
          else await reactor.send.patch({});
        });
        expect(out.tracked).toBe(out.full);
      }
    });
  }
});

describe('route lifetime', () => {
  class R extends Reactor<{ n: number }, { go: void }> {
    constructor() {
      super({ n: 0 });
    }
  }
  const { Provider } = createReactorContext<R>('Route');

  it('a screen-scoped reactor is disposed when its screen is popped, a shared one is not', () => {
    const shared = new R();
    const created: R[] = [];
    const Stack = ({ depth }: { depth: number }) =>
      createElement(
        Container0,
        null,
        depth > 0
          ? createElement(Provider, {
              create: () => (created[created.length] = new R()),
              children: null,
            })
          : null,
        createElement(Provider, { reactor: shared, children: null }),
      );
    const Container0 = ({ children }: { children?: any }) =>
      createElement('div' as any, null, children);
    const tree = render(createElement(Stack, { depth: 1 }));
    expect(created[0].isDisposed).toBe(false);
    act(() => tree.update(createElement(Stack, { depth: 0 }))); // pop
    expect(created[0].isDisposed).toBe(true);
    act(() => tree.update(createElement(Stack, { depth: 1 }))); // push again: a fresh one
    const fresh = created[created.length - 1];
    expect(fresh).not.toBe(created[0]);
    expect(fresh.isDisposed).toBe(false);
    act(() => tree.unmount());
    expect(shared.isDisposed).toBe(false);
  });
});

describe('consoleReactorObserver', () => {
  it('logs the life of a reactor', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { consoleReactorObserver } = require('../src');
    ReactorObserver.current = consoleReactorObserver;
    class R extends Reactor<{ n: number }, { go: void }> {
      constructor() {
        super({ n: 0 });
        this.on.go((_, { emit }) => emit({ n: 1 }));
      }
    }
    const r = new R();
    await r.send.go();
    consoleReactorObserver.onError?.(r, new Error('x'), { type: 'go' });
    r.dispose();
    expect(log).toHaveBeenCalledTimes(4);
    expect(warn).toHaveBeenCalledTimes(1);
    log.mockRestore();
    warn.mockRestore();
  });
});
