import { createContext, ReactNode, useContext, useMemo } from 'react';
import { useOwned } from '../internal/use-owned';
import { Container } from './container';
import type { Token } from './token';

const ContainerContext = createContext<Container | null>(null);

/** Makes [container] available to the tree. The caller owns it and disposes it. */
export function DIProvider({ container, children }: { container: Container; children: ReactNode }) {
  return <ContainerContext.Provider value={container}>{children}</ContainerContext.Provider>;
}

/**
 * A child scope of the nearest container for this subtree, disposed when the subtree unmounts.
 * Use `setup` to register things that only exist for this flow.
 */
export function DIScope({ setup, children }: { setup?: (scope: Container) => void; children: ReactNode }) {
  const parent = useContainer();
  const scope = useOwned(() => {
    const created = parent.createScope();
    setup?.(created);
    return created;
  });
  return <ContainerContext.Provider value={scope}>{children}</ContainerContext.Provider>;
}

export function useContainer(): Container {
  const container = useContext(ContainerContext);
  if (!container) throw new Error('No Container found. Wrap the app in <DIProvider container={...}>.');
  return container;
}

/** The nearest container, or undefined outside a `DIProvider`. */
export function useOptionalContainer(): Container | null {
  return useContext(ContainerContext);
}

export function useResolve<T>(token: Token<T>): T {
  const container = useContainer();
  return useMemo(() => container.resolve(token), [container, token]);
}
