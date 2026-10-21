/** A typed key for the container. `createToken<Clock>('Clock')`. */
export interface Token<T> {
  readonly id: symbol;
  readonly name: string;
  /** Phantom field that carries `T`; never set. */
  readonly __type?: T;
}

export function createToken<T>(name: string): Token<T> {
  return { id: Symbol(name), name };
}
