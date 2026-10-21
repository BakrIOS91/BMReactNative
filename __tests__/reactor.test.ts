import {
  Reactor,
  ReactorObserver,
  recordEffects,
  recordStates,
  waitForState,
  ValueNotifier,
} from '../src';

type State = { count: number; log: string[] };
interface Act {
  inc: void;
  slow: { id: string; ms: number };
  boom: void;
  watch: { source: ValueNotifier<number> };
  ping: void;
}
type Fx = { kind: 'toast'; text: string };
type Transformer = 'concurrent' | 'sequential' | 'restartable' | 'droppable';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

class TestReactor extends Reactor<State, Act, Fx> {
  disposed = false;
  errors: unknown[] = [];
  constructor(transformer: Transformer = 'concurrent') {
    super({ count: 0, log: [] });
    this.on.inc((_, { emit }) => emit((s) => ({ ...s, count: s.count + 1 })));
    this.on.slow(
      async (a, ctx) => {
        await wait(a.ms);
        ctx.emit((s) => ({ ...s, log: [...s.log, a.id] }));
        ctx.effect({ kind: 'toast', text: a.id });
      },
      { transformer },
    );
    this.on.boom(() => {
      throw new Error('boom');
    });
    this.on.watch((a, ctx) => {
      ctx.listen(a.source, (n) => ctx.emit((s) => ({ ...s, count: n })));
    });
  }
  protected onError(error: unknown) {
    this.errors.push(error);
  }
  protected onDispose() {
    this.disposed = true;
  }
}

afterEach(() => {
  ReactorObserver.current = undefined;
});

it('emits states, skips identical ones and ignores actions without a handler', async () => {
  const r = new TestReactor();
  const rec = recordStates(r);
  await r.send.inc();
  await r.send.ping();
  expect(rec.states.map((s) => s.count)).toEqual([0, 1]);
  expect(r.state.count).toBe(1);
});

it('does not emit when the next state is the same object', async () => {
  class Same extends Reactor<{ n: number }, { x: void }> {
    constructor() {
      super({ n: 1 });
      this.on.x((_, { emit, state }) => emit(state));
    }
  }
  const r = new Same();
  const rec = recordStates(r);
  await r.send.x();
  expect(rec.states).toHaveLength(1);
});

it('sequential runs one handler at a time, in order', async () => {
  const r = new TestReactor('sequential');
  await Promise.all([r.send.slow({ id: 'a', ms: 20 }), r.send.slow({ id: 'b', ms: 1 })]);
  expect(r.state.log).toEqual(['a', 'b']);
});

it('concurrent lets the faster one finish first', async () => {
  const r = new TestReactor('concurrent');
  await Promise.all([r.send.slow({ id: 'a', ms: 20 }), r.send.slow({ id: 'b', ms: 1 })]);
  expect(r.state.log).toEqual(['b', 'a']);
});

it('restartable cancels the previous run: its emit and effect are ignored', async () => {
  const r = new TestReactor('restartable');
  const fx = recordEffects(r);
  await Promise.all([r.send.slow({ id: 'old', ms: 20 }), r.send.slow({ id: 'new', ms: 1 })]);
  expect(r.state.log).toEqual(['new']);
  expect(fx.effects).toEqual([{ kind: 'toast', text: 'new' }]);
});

it('droppable ignores actions while one is running', async () => {
  const r = new TestReactor('droppable');
  await Promise.all([r.send.slow({ id: 'a', ms: 10 }), r.send.slow({ id: 'b', ms: 1 })]);
  expect(r.state.log).toEqual(['a']);
  await r.send.slow({ id: 'c', ms: 1 });
  expect(r.state.log).toEqual(['a', 'c']);
});

it('routes handler errors to onError and the observer, and keeps working', async () => {
  const seen: string[] = [];
  ReactorObserver.current = { onError: (_r, _e, a) => void seen.push(a.type) };
  const r = new TestReactor();
  await r.send.boom();
  expect(r.errors).toHaveLength(1);
  expect(seen).toEqual(['boom']);
  await r.send.inc();
  expect(r.state.count).toBe(1);
});

it('logs to console.error by default', async () => {
  class Plain extends Reactor<number, { boom: void }> {
    constructor() {
      super(0);
      this.on.boom(() => Promise.reject(new Error('x')));
    }
  }
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  await new Plain().send.boom();
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});

it('listen keeps feeding state after the handler returns and stops on dispose', async () => {
  const r = new TestReactor();
  const source = new ValueNotifier(0);
  await r.send.watch({ source });
  source.value = 5;
  expect(r.state.count).toBe(5);
  r.dispose();
  source.value = 9;
  expect(r.state.count).toBe(5);
  expect(r.disposed).toBe(true);
});

it('listen survives errors thrown in onData', async () => {
  class L extends Reactor<number, { go: { source: ValueNotifier<number> } }> {
    errors = 0;
    constructor() {
      super(0);
      this.on.go((a, ctx) => {
        ctx.listen(a.source, () => {
          throw new Error('bad');
        });
      });
    }
    protected onError() {
      this.errors++;
    }
  }
  const source = new ValueNotifier(0);
  const r = new L();
  await r.send.go({ source });
  source.value = 1;
  expect(r.errors).toBe(1);
});

it('a restarted handler releases its listen subscriptions', async () => {
  class R2 extends Reactor<number, { go: { source: ValueNotifier<number> } }> {
    constructor() {
      super(0);
      this.on.go((a, ctx) => void ctx.listen(a.source, (n) => ctx.emit(n)), {
        transformer: 'restartable',
      });
    }
  }
  const a = new ValueNotifier(0);
  const b = new ValueNotifier(0);
  const r = new R2();
  await r.send.go({ source: a });
  await r.send.go({ source: b });
  a.value = 1;
  expect(r.state).toBe(0);
  b.value = 2;
  expect(r.state).toBe(2);
});

it('ctx.state is current after awaits, ctx.send chains actions, ctx.isCancelled reports disposal', async () => {
  class C extends Reactor<number, { a: void; b: void }> {
    sawCancelled = false;
    constructor() {
      super(0);
      this.on.a(async (_, ctx) => {
        await ctx.send.b();
        ctx.emit(ctx.state + 10);
        await wait(5);
        this.sawCancelled = ctx.isCancelled;
      });
      this.on.b((_, ctx) => ctx.emit(ctx.state + 1));
    }
  }
  const r = new C();
  const done = r.send.a();
  await wait(1);
  expect(r.state).toBe(11);
  r.dispose();
  await done;
  expect(r.sawCancelled).toBe(true);
});

it('after dispose, send is a no-op and dispose is idempotent', async () => {
  const r = new TestReactor();
  r.dispose();
  r.dispose();
  await r.send.inc();
  expect(r.state.count).toBe(0);
  expect(r.isDisposed).toBe(true);
});

it('reports to the observer with the action name and payload', async () => {
  const calls: string[] = [];
  ReactorObserver.current = {
    onCreate: () => void calls.push('create'),
    onAction: (_r, a) => void calls.push(`action:${JSON.stringify(a)}`),
    onTransition: (_r, t) =>
      void calls.push(`transition:${t.action.type}:${t.current.count}->${t.next.count}`),
    onDispose: () => void calls.push('dispose'),
  };
  const r = new TestReactor();
  await r.send.inc();
  await r.send.slow({ id: 'x', ms: 0 });
  r.dispose();
  expect(calls).toEqual([
    'create',
    'action:{"type":"inc"}',
    'transition:inc:0->1',
    'action:{"id":"x","ms":0,"type":"slow"}',
    'transition:slow:1->1',
    'dispose',
  ]);
});

it('the typed send and on reject wrong usage at compile time', () => {
  const r = new TestReactor();
  // @ts-expect-error 'slow' needs a payload
  void r.send.slow();
  // @ts-expect-error unknown action
  void r.send.nope;
  // @ts-expect-error 'inc' takes no payload
  void r.send.inc({ x: 1 });
});

it('send/on proxies ignore symbols and "then" (safe to return from async functions)', async () => {
  const r = new TestReactor();
  const get = async () => r.send;
  const send = await get();
  expect(typeof send.inc).toBe('function');
  expect((send as any)[Symbol.iterator]).toBeUndefined();
});

it('waitForState resolves for current and future states, and times out', async () => {
  const r = new TestReactor();
  await expect(waitForState(r, (s) => s.count === 0)).resolves.toMatchObject({
    count: 0,
  });
  const later = waitForState(r, (s) => s.count === 2);
  await r.send.inc();
  await r.send.inc();
  await expect(later).resolves.toMatchObject({ count: 2 });
  await expect(waitForState(r, (s) => s.count === 99, 10)).rejects.toThrow('timed out');
});

it('effects reach listeners and stop after unsubscribe', async () => {
  const r = new TestReactor();
  const fx = recordEffects(r);
  await r.send.slow({ id: 'a', ms: 1 });
  fx.stop();
  await r.send.slow({ id: 'b', ms: 1 });
  expect(fx.effects).toEqual([{ kind: 'toast', text: 'a' }]);
});

describe('composition', () => {
  interface StepAction {
    answer: { value: string };
  }
  class StepReactor extends Reactor<{ answer?: string }, StepAction> {
    constructor() {
      super({});
      this.on.answer(({ value }, ctx) => ctx.emit({ answer: value }));
    }
  }

  interface FlowAction {
    start: void;
  }
  /** A flow made of two steps; its state follows both and is complete when both are answered. */
  class FlowReactor extends Reactor<{ complete: boolean; answers: string[] }, FlowAction> {
    readonly first = this.own(new StepReactor());
    readonly second = this.own(new StepReactor());

    constructor() {
      super({ complete: false, answers: [] });
      this.on.start((_, ctx) => {
        const update = () => {
          const answers = [this.first.state.answer, this.second.state.answer].filter(
            (a): a is string => a !== undefined,
          );
          ctx.emit({ answers, complete: answers.length === 2 });
        };
        ctx.listen(this.first, update);
        ctx.listen(this.second, update);
      });
    }
  }

  it('a parent follows the state of the children it owns', async () => {
    const flow = new FlowReactor();
    await flow.send.start();
    await flow.first.send.answer({ value: 'a' });
    expect(flow.state).toEqual({ complete: false, answers: ['a'] });
    await flow.second.send.answer({ value: 'b' });
    expect(flow.state).toEqual({ complete: true, answers: ['a', 'b'] });
  });

  it('disposes owned children with the parent, last owned first, and stops following them', async () => {
    const order: string[] = [];
    class Child extends StepReactor {
      constructor(readonly name: string) {
        super();
      }
      protected onDispose() {
        order.push(this.name);
      }
    }
    class Parent extends Reactor<number, { noop: void }> {
      constructor() {
        super(0);
        this.own(new Child('one'));
        this.own(new Child('two'));
      }
    }
    const parent = new Parent();
    parent.dispose();
    expect(order).toEqual(['two', 'one']);

    const flow = new FlowReactor();
    await flow.send.start();
    const { first } = flow;
    flow.dispose();
    expect(first.isDisposed).toBe(true);
    expect(flow.second.isDisposed).toBe(true);
  });

  it('a shared reactor that is only listened to is not disposed by its follower', async () => {
    const shared = new StepReactor();
    class Follower extends Reactor<string | undefined, { watch: void }> {
      constructor() {
        super(undefined);
        this.on.watch((_, ctx) => {
          ctx.listen(shared, (s) => ctx.emit(s.answer));
        });
      }
    }
    const follower = new Follower();
    await follower.send.watch();
    await shared.send.answer({ value: 'x' });
    expect(follower.state).toBe('x');
    follower.dispose();
    expect(shared.isDisposed).toBe(false);
    await shared.send.answer({ value: 'y' });
    expect(follower.state).toBe('x');
  });

  it('owning a child after the parent was disposed disposes it at once', () => {
    class Parent extends Reactor<number, { noop: void }> {
      adopt(child: StepReactor) {
        return this.own(child);
      }
    }
    const parent = new Parent(0);
    parent.dispose();
    const child = parent.adopt(new StepReactor());
    expect(child.isDisposed).toBe(true);
  });
});
