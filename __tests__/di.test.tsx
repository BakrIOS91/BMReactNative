import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import {
  Locator,
  Container,
  createToken,
  DIProvider,
  DIScope,
  useContainer,
  useResolve,
} from '../src';

class Db {
  closed = false;
  close() {
    this.closed = true;
  }
}
const DbToken = createToken<Db>('Db');
const RepoToken = createToken<{ db: Db }>('Repo');
const IdToken = createToken<{ n: number }>('Id');

it('resolves lazily with singleton lifetime by default', () => {
  let made = 0;
  const c = new Container().register(DbToken, () => (made++, new Db()));
  expect(made).toBe(0);
  expect(c.resolve(DbToken)).toBe(c.resolve(DbToken));
  expect(made).toBe(1);
});

it('injects dependencies through the container', () => {
  const c = new Container().register(DbToken, () => new Db()).register(RepoToken, (x) => ({ db: x.resolve(DbToken) }));
  expect(c.resolve(RepoToken).db).toBe(c.resolve(DbToken));
});

it('transient gives a new instance each time; scoped one per scope', () => {
  let n = 0;
  const c = new Container().register(IdToken, () => ({ n: ++n }), { lifetime: 'transient' });
  expect(c.resolve(IdToken)).not.toBe(c.resolve(IdToken));

  const s = new Container().register(IdToken, () => ({ n: ++n }), { lifetime: 'scoped' });
  const a = s.createScope();
  const b = s.createScope();
  expect(a.resolve(IdToken)).toBe(a.resolve(IdToken));
  expect(a.resolve(IdToken)).not.toBe(b.resolve(IdToken));
});

it('singletons registered in the parent are shared with scopes; scopes can override', () => {
  const root = new Container().register(DbToken, () => new Db());
  const scope = root.createScope();
  expect(scope.resolve(DbToken)).toBe(root.resolve(DbToken));

  const fake = new Db();
  const override = root.createScope().registerValue(DbToken, fake);
  expect(override.resolve(DbToken)).toBe(fake);
  expect(root.resolve(DbToken)).not.toBe(fake);
});

it('detects circular dependencies and missing registrations', () => {
  const A = createToken<unknown>('A');
  const B = createToken<unknown>('B');
  const c = new Container().register(A, (x) => x.resolve(B)).register(B, (x) => x.resolve(A));
  expect(() => c.resolve(A)).toThrow('Circular dependency: A -> B -> A');
  expect(() => c.resolve(createToken('Nope'))).toThrow('No registration for "Nope"');
  expect(c.tryResolve(createToken('Nope'))).toBeUndefined();
  expect(c.has(A)).toBe(true);
  // The failed resolve must not leave the stack dirty.
  expect(() => c.resolve(A)).toThrow('Circular dependency');
});

it('refuses to re-register something already resolved', () => {
  const c = new Container().register(DbToken, () => new Db());
  c.resolve(DbToken);
  expect(() => c.register(DbToken, () => new Db())).toThrow('already resolved');
});

it('disposes in reverse creation order, scopes first, and only what it created', () => {
  const order: string[] = [];
  const mk = (name: string) => ({ dispose: () => void order.push(name) });
  const A = createToken<ReturnType<typeof mk>>('A');
  const B = createToken<ReturnType<typeof mk>>('B');
  const S = createToken<ReturnType<typeof mk>>('S');
  const root = new Container()
    .register(A, () => mk('A'))
    .register(B, (c) => (c.resolve(A), mk('B')))
    .register(S, () => mk('scoped'), { lifetime: 'scoped' });
  const scope = root.createScope();
  root.resolve(B);
  scope.resolve(S);
  scope.resolve(A);
  scope.dispose();
  expect(order).toEqual(['scoped']);
  expect(() => scope.resolve(S)).toThrow('disposed');
  root.dispose();
  root.dispose();
  expect(order).toEqual(['scoped', 'B', 'A']);
});

it('uses close() and a custom dispose, skips registerValue by default, and survives throwing disposers', () => {
  const db = new Db();
  const external = new Db();
  const Ext = createToken<Db>('Ext');
  const Bad = createToken<object>('Bad');
  const custom: string[] = [];
  const Custom = createToken<string>('Custom');
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const c = new Container()
    .registerValue(DbToken, db, { dispose: (d) => d.close() })
    .registerValue(Ext, external)
    .register(Bad, () => ({ dispose: () => { throw new Error('x'); } }))
    .register(Custom, () => 'v', { dispose: (v) => void custom.push(v) });
  c.resolve(DbToken);
  c.resolve(Ext);
  c.resolve(Bad);
  c.resolve(Custom);
  c.dispose();
  expect(db.closed).toBe(true);
  expect(external.closed).toBe(false);
  expect(custom).toEqual(['v']);
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
  expect(() => c.register(DbToken, () => new Db())).toThrow('disposed');
});

it('useResolve / DIScope work in React; scopes dispose on unmount; missing provider throws', () => {
  const root = new Container().register(DbToken, () => new Db());
  const scoped = createToken<Db>('ScopedDb');
  let scopedDb: Db | undefined;
  let seen: Db | undefined;
  let containerInScope: Container | undefined;

  function Probe() {
    seen = useResolve(DbToken);
    scopedDb = useResolve(scoped);
    containerInScope = useContainer();
    return null;
  }
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      createElement(DIProvider, {
        container: root,
        children: createElement(DIScope, {
          setup: (s: Container) => void s.register(scoped, () => new Db()),
          children: createElement(Probe),
        }),
      }),
    );
  });
  expect(seen).toBe(root.resolve(DbToken));
  expect(containerInScope).not.toBe(root);
  act(() => tree.unmount());
  expect(scopedDb!.closed).toBe(true);
  expect(root.isDisposed).toBe(false);

  const err = jest.spyOn(console, 'error').mockImplementation(() => {});
  expect(() => TestRenderer.create(createElement(Probe))).toThrow('No Container found');
  err.mockRestore();
});

describe('Locator', () => {
  const Value = createToken<string>('Value');
  afterEach(() => Locator.reset());

  it('throws before setup, resolves from the root container after, and can be reset', () => {
    expect(Locator.isReady).toBe(false);
    expect(() => Locator.get(Value)).toThrow('before Locator.setup');

    const root = new Container().registerValue(Value, 'hello');
    Locator.setup(root);
    expect(Locator.isReady).toBe(true);
    expect(Locator.get(Value)).toBe('hello');
    expect(Locator.get(Value)).toBe(root.resolve(Value));

    Locator.reset();
    expect(Locator.isReady).toBe(false);
    expect(() => Locator.get(Value)).toThrow();
  });
});
