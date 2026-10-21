import type { Token } from './token';

/**
 * - `singleton`: one instance for the container that registered it (and its scopes).
 * - `scoped`: one instance per scope; the root container counts as a scope.
 * - `transient`: a new instance on every resolve. Not tracked, so the caller disposes it.
 */
export type Lifetime = 'singleton' | 'scoped' | 'transient';

export interface RegisterOptions<T> {
  lifetime?: Lifetime;
  /** Called when the owning container is disposed. Default: the value's `dispose()` or `close()`. */
  dispose?: (value: T) => void;
}

interface Registration<T> {
  token: Token<T>;
  factory: (container: Container) => T;
  lifetime: Lifetime;
  dispose?: (value: T) => void;
  owner: Container;
}

interface Created {
  value: unknown;
  registration: Registration<any>;
}

function defaultDispose(value: unknown): void {
  const target = value as { dispose?: () => void; close?: () => void } | null;
  if (typeof target?.dispose === 'function') target.dispose();
  else if (typeof target?.close === 'function') target.close();
}

/**
 * A small dependency-injection container. Dependencies are resolved lazily, by typed token,
 * with explicit lifetimes and disposal:
 *
 * ```ts
 * const Http = createToken<HttpClient>('Http');
 * const container = new Container()
 *   .register(Http, () => new HttpClient())
 *   .register(ProductRepo, (c) => new ProductRepo(c.resolve(Http)));
 * ```
 *
 * Create a scope per flow (`container.createScope()`) for objects that should die with it.
 * A scope can re-register a token to override its parent, which is how tests swap fakes in.
 */
export class Container {
  private readonly registrations = new Map<symbol, Registration<any>>();
  private readonly instances = new Map<symbol, unknown>();
  private readonly created: Created[] = [];
  private readonly children = new Set<Container>();
  private readonly resolving: Token<any>[];
  private _disposed = false;

  constructor(private readonly parent?: Container) {
    this.resolving = parent?.resolving ?? [];
    parent?.children.add(this);
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  /** Registers (or replaces, before first use) the factory for [token]. Default lifetime: singleton. */
  register<T>(token: Token<T>, factory: (container: Container) => T, options: RegisterOptions<T> = {}): this {
    this.assertAlive();
    if (this.instances.has(token.id)) {
      throw new Error(`Cannot re-register "${token.name}": it was already resolved.`);
    }
    this.registrations.set(token.id, {
      token,
      factory,
      lifetime: options.lifetime ?? 'singleton',
      dispose: options.dispose,
      owner: this,
    });
    return this;
  }

  /** Registers an existing object. The container does not dispose it unless [dispose] is passed. */
  registerValue<T>(token: Token<T>, value: T, options: Pick<RegisterOptions<T>, 'dispose'> = {}): this {
    return this.register(token, () => value, {
      lifetime: 'singleton',
      dispose: options.dispose ?? (() => {}),
    });
  }

  has(token: Token<any>): boolean {
    return this.find(token) !== undefined;
  }

  tryResolve<T>(token: Token<T>): T | undefined {
    return this.has(token) ? this.resolve(token) : undefined;
  }

  resolve<T>(token: Token<T>): T {
    this.assertAlive();
    const registration = this.find(token);
    if (!registration) throw new Error(`No registration for "${token.name}".`);

    if (registration.lifetime === 'transient') return this.construct(registration, this);

    const holder = registration.lifetime === 'singleton' ? registration.owner : this;
    if (holder.instances.has(token.id)) return holder.instances.get(token.id) as T;

    const value = holder.construct(registration, holder);
    holder.instances.set(token.id, value);
    holder.created.push({ value, registration });
    return value;
  }

  /** A child container for a flow or screen. Disposing it disposes what it created, not the parent's. */
  createScope(): Container {
    this.assertAlive();
    return new Container(this);
  }

  /** Disposes child scopes, then own instances in reverse creation order. Idempotent. */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    for (const child of [...this.children]) child.dispose();
    for (const { value, registration } of [...this.created].reverse()) {
      try {
        (registration.dispose ?? defaultDispose)(value);
      } catch (error) {
        console.error(`[Container] disposing "${registration.token.name}" failed`, error);
      }
    }
    this.created.length = 0;
    this.instances.clear();
    this.registrations.clear();
    this.parent?.children.delete(this);
  }

  private find<T>(token: Token<T>): Registration<T> | undefined {
    for (let c: Container | undefined = this; c; c = c.parent) {
      const registration = c.registrations.get(token.id);
      if (registration) return registration;
    }
    return undefined;
  }

  private construct<T>(registration: Registration<T>, container: Container): T {
    const { token } = registration;
    if (this.resolving.includes(token)) {
      const chain = [...this.resolving, token].map((t) => t.name).join(' -> ');
      throw new Error(`Circular dependency: ${chain}`);
    }
    this.resolving.push(token);
    try {
      return registration.factory(container);
    } finally {
      this.resolving.pop();
    }
  }

  private assertAlive(): void {
    if (this._disposed) throw new Error('This container was disposed.');
  }
}
