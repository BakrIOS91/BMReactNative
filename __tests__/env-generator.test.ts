import fs from 'fs';
import os from 'os';
import path from 'path';
import { generate, parse } from '../scripts/bm-env';

function project(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-env-'));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
}

/** Evaluates the generated module (type annotations stripped) and returns its export. */
function load(file: string, name = 'Env'): Record<string, string> {
  const js = fs
    .readFileSync(file, 'utf8')
    .replace(/: number\[\]/g, '')
    .replace(/: string/g, '')
    .replace(/ as const/g, '')
    .replace(`export const ${name}`, `const ${name}`);
  return new Function(`${js}; return ${name};`)();
}

it('parses comments, blank lines, quotes and values containing "="', () => {
  expect(parse('# c\nA=1\nB="two words"\n\nC=x=y\nD=\'q\'\nnoequals')).toEqual({ A: '1', B: 'two words', C: 'x=y', D: 'q' });
});

it('writes an obfuscated module that decodes back to the values, including non-ASCII', () => {
  const cwd = project({ '.env': 'API_HOST=api.example.com\nTITLE=Café ☕\nEMPTY=\n' });
  const { keys, out } = generate({ cwd, log: false });
  expect(keys).toEqual(['API_HOST', 'TITLE', 'EMPTY']);
  const text = fs.readFileSync(out, 'utf8');
  expect(text).not.toContain('api.example.com');
  expect(text).not.toContain('Café');
  expect(load(out)).toEqual({ API_HOST: 'api.example.com', TITLE: 'Café ☕', EMPTY: '' });
});

it('uses a fresh key each time', () => {
  const cwd = project({ '.env': 'A=secret-value\n' });
  const first = fs.readFileSync(generate({ cwd, log: false }).out, 'utf8');
  const second = fs.readFileSync(generate({ cwd, log: false }).out, 'utf8');
  expect(second).not.toBe(first);
});

it('honours env, out, name, example and falls back to the example file with a warning', () => {
  const cwd = project({ '.env.example': 'A=fallback\n', '.env.staging': 'A=staging\n' });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const fallback = generate({ cwd, out: 'gen/nested/Config.ts', name: 'Config' });
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('using .env.example'));
  expect(load(fallback.out, 'Config')).toEqual({ A: 'fallback' });
  warn.mockRestore();

  const staging = generate({ cwd, env: '.env.staging', out: 'gen/Staging.ts', log: false });
  expect(load(staging.out)).toEqual({ A: 'staging' });
});

it('layers .env, .env.<mode>, .env.local and .env.<mode>.local, later files winning', () => {
  const cwd = project({
    '.env': 'HOST=base.example.com\nSHARED=yes\nDEBUG=0\n',
    '.env.staging': 'HOST=staging.example.com\nDEBUG=1\n',
    '.env.local': 'SHARED=local\n',
    '.env.staging.local': 'DEBUG=2\n',
    '.env.production': 'HOST=prod.example.com\n',
  });
  const staging = generate({ cwd, mode: 'staging', log: false });
  expect(staging.source).toBe('.env + .env.staging + .env.local + .env.staging.local');
  expect(load(staging.out)).toEqual({ HOST: 'staging.example.com', SHARED: 'local', DEBUG: '2' });
  expect(load(generate({ cwd, mode: 'production', log: false }).out)).toMatchObject({ HOST: 'prod.example.com', DEBUG: '0' });
  // A mode without its own files is just the base.
  expect(load(generate({ cwd, mode: 'development', log: false }).out)).toMatchObject({ HOST: 'base.example.com' });
});

it('takes the mode from APP_ENV, and --env wins over a mode', () => {
  const cwd = project({ '.env': 'A=base\n', '.env.qa': 'A=qa\n', 'custom.env': 'A=custom\n' });
  process.env.APP_ENV = 'qa';
  try {
    expect(load(generate({ cwd, log: false }).out)).toEqual({ A: 'qa' });
    expect(load(generate({ cwd, env: 'custom.env', log: false }).out)).toEqual({ A: 'custom' });
  } finally {
    delete process.env.APP_ENV;
  }
});

it('reads APP_ENV_FILE when no env option is given', () => {
  const cwd = project({ '.env': 'A=default\n', '.env.prod': 'A=prod\n' });
  process.env.APP_ENV_FILE = '.env.prod';
  try {
    expect(load(generate({ cwd, log: false }).out)).toEqual({ A: 'prod' });
  } finally {
    delete process.env.APP_ENV_FILE;
  }
});

it('fails clearly when there is nothing to read', () => {
  expect(() => generate({ cwd: project({}), log: false })).toThrow('none of .env, .env.local or .env.example exists');
});

it('the CLI writes the file and rejects unknown flags', () => {
  const { spawnSync } = require('child_process');
  const cwd = project({ '.env': 'A=1\n', '.env.dev': 'A=2\n' });
  const bin = path.resolve(__dirname, '../scripts/bm-env.js');
  const ok = spawnSync('node', [bin, '--out', 'x/env.ts', '--name', 'Cfg'], { cwd, encoding: 'utf8' });
  expect(ok.status).toBe(0);
  expect(ok.stdout).toContain('wrote x/env.ts from .env (A)');
  expect(load(path.join(cwd, 'x/env.ts'), 'Cfg')).toEqual({ A: '1' });
  const mode = spawnSync('node', [bin, '--mode', 'dev', '--out', 'y.ts'], { cwd, encoding: 'utf8' });
  expect(mode.stdout).toContain('from .env + .env.dev');
  expect(load(path.join(cwd, 'y.ts'))).toEqual({ A: '2' });
  const bad = spawnSync('node', [bin, '--nope', 'x'], { cwd, encoding: 'utf8' });
  expect(bad.status).toBe(2);
  expect(bad.stderr).toContain('Usage');
  const missing = spawnSync('node', [bin], { cwd: project({}), encoding: 'utf8' });
  expect(missing.status).toBe(1);
});
