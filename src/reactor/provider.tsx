import { createContext, ReactNode, useContext } from 'react';
import { Container } from '../di/container';
import { useOptionalContainer } from '../di/react';
import { useOwned } from '../internal/use-owned';
import type { Disposable } from '../internal/use-owned';

export interface ReactorProviderProps<R> {
  /**
   * Builds the reactor, pulling dependencies from the container: `create={(c) => new X(c.resolve(Api))}`.
   * Must be side-effect free; it can run twice in development. The provider disposes the reactor on unmount.
   */
  create?: (container: Container) => R;
  /** Provide an existing reactor instead (not disposed by the provider). */
  reactor?: R;
  /** Runs after mount: send the first action here. */
  start?: (reactor: R) => void;
  children: ReactNode;
}

const emptyContainer = new Container();

/**
 * Creates a typed provider and hook for one kind of reactor:
 *
 * ```ts
 * export const { Provider: ProductsProvider, useReactor: useProducts } = createReactorContext<ProductsReactor>('Products');
 * ```
 */
export function createReactorContext<R extends Disposable>(displayName = 'Reactor') {
  const Context = createContext<R | null>(null);
  Context.displayName = `${displayName}Context`;

  function Provider({ create, reactor, start, children }: ReactorProviderProps<R>) {
    const container = useOptionalContainer() ?? emptyContainer;
    const owned = !reactor;
    const instance = useOwned<R>(
      () => {
        if (reactor) return reactor;
        if (!create) throw new Error(`${displayName}Provider needs "create" or "reactor".`);
        return create(container);
      },
      start,
      owned,
    );
    return <Context.Provider value={instance}>{children}</Context.Provider>;
  }
  Provider.displayName = `${displayName}Provider`;

  /** The reactor of the nearest provider. Pass it to `useReactor` / `useReactorState`. */
  function useContextReactor(): R {
    const reactor = useContext(Context);
    if (!reactor) throw new Error(`Use ${displayName}Provider above this component.`);
    return reactor;
  }

  return { Provider, useReactor: useContextReactor, Context };
}
