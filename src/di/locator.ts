import type { Container } from './container';
import type { Token } from './token';

/**
 * A global accessor to the root container, for code that React context cannot reach
 * (notification handlers, deep links, background tasks).
 *
 * ```ts
 * Locator.setup(container);              // once at startup
 * const api = Locator.get(ApiToken);     // anywhere
 * ```
 *
 * In components prefer `useResolve`, which respects scopes and overrides.
 */
export class Locator {
  private static root?: Container;

  /** Call once at startup, after creating the root container. */
  static setup(container: Container): void {
    Locator.root = container;
  }

  static get<T>(token: Token<T>): T {
    if (!Locator.root) throw new Error('Locator used before Locator.setup(container).');
    return Locator.root.resolve(token);
  }

  /** True once `setup` has been called. */
  static get isReady(): boolean {
    return Locator.root !== undefined;
  }

  /** Forgets the container (tests, or after disposing it on logout). */
  static reset(): void {
    Locator.root = undefined;
  }
}
