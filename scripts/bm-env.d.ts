export interface GenerateEnvOptions {
  /** Project root; defaults to the current directory. */
  cwd?: string;
  /** Environment name: layers `.env`, `.env.<mode>`, `.env.local`, `.env.<mode>.local`. Defaults to `APP_ENV`. */
  mode?: string;
  /** Read exactly this file instead of layering. Defaults to `APP_ENV_FILE`. */
  env?: string;
  /** Fallback when the env file is missing; defaults to `.env.example`. */
  example?: string;
  /** Output module; defaults to `src/core/env.g.ts`. */
  out?: string;
  /** Exported constant name; defaults to `Env`. */
  name?: string;
  /** Set false to silence the "using .env.example" warning. */
  log?: boolean;
}

export function generate(options?: GenerateEnvOptions): { keys: string[]; source: string; sources: string[]; out: string };
export function parse(text: string): Record<string, string>;
