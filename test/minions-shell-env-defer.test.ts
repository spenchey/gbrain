import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import type { MinionJobContext } from '../src/core/minions/types.ts';
import { shellHandler } from '../src/core/minions/handlers/shell.ts';
import {
  isSensitiveEnvEntry,
  splitDeferredEnv,
  applyDeferredEnv,
} from '../src/core/minions/handlers/shell-env-defer.ts';
import { validateShellJobParams } from '../src/core/minions/handlers/shell-validate.ts';
import { UnrecoverableError } from '../src/core/minions/types.ts';

// The shell handler refuses to run without the worker opt-in flag; these are
// handler-mechanics tests, so enable for the file and restore on teardown
// (same pattern as minions-shell.test.ts).
let prevAllowShellJobs: string | undefined;
beforeAll(() => {
  prevAllowShellJobs = process.env.GBRAIN_ALLOW_SHELL_JOBS;
  process.env.GBRAIN_ALLOW_SHELL_JOBS = '1';
});
afterAll(() => {
  if (prevAllowShellJobs === undefined) delete process.env.GBRAIN_ALLOW_SHELL_JOBS;
  else process.env.GBRAIN_ALLOW_SHELL_JOBS = prevAllowShellJobs;
});

function makeCtx(data: Record<string, unknown>): MinionJobContext {
  return {
    id: 1,
    name: 'shell',
    data,
    attempts_made: 0,
    signal: new AbortController().signal,
    deadlineAtMs: null,
    shutdownSignal: new AbortController().signal,
    updateProgress: async () => {},
    updateTokens: async () => {},
    log: async () => {},
    isActive: async () => true,
    readInbox: async () => [],
  };
}

// ---- key-name pattern stripping ---------------------------------------------

describe('splitDeferredEnv: key-name patterns', () => {
  test('credential-shaped key names are deferred', () => {
    const { env, deferredKeys } = splitDeferredEnv({
      GH_TOKEN: 'a',
      GITHUB_TOKEN: 'b',
      SLACK_BOT_TOKEN: 'c',
      SLACK_APP_TOKEN: 'd',
      LINEAR_API_KEY: 'e',
      GBRAIN_DATABASE_URL: 'f',
      DATABASE_URL: 'g',
      AWS_SECRET_ACCESS_KEY: 'h',
      AWS_ACCESS_KEY_ID: 'i',
      MY_SERVICE_PASSWORD: 'j',
      SOME_PRIVATE_KEY: 'k',
      SUPABASE_SERVICE_KEY: 'l',
    });
    expect(deferredKeys).toEqual([
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'DATABASE_URL',
      'GBRAIN_DATABASE_URL',
      'GH_TOKEN',
      'GITHUB_TOKEN',
      'LINEAR_API_KEY',
      'MY_SERVICE_PASSWORD',
      'SLACK_APP_TOKEN',
      'SLACK_BOT_TOKEN',
      'SOME_PRIVATE_KEY',
      'SUPABASE_SERVICE_KEY',
    ]);
    expect(env).toEqual({});
  });

  test('sensitive keys are deferred even with empty-string values', () => {
    const { env, deferredKeys } = splitDeferredEnv({ GH_TOKEN: '', PATH: '/usr/bin' });
    expect(deferredKeys).toEqual(['GH_TOKEN']);
    expect(env).toEqual({ PATH: '/usr/bin' });
  });

  test('structural keys survive: GIT_CONFIG_KEY_N is a config key NAME, not a credential', () => {
    const { env, deferredKeys } = splitDeferredEnv({
      GIT_CONFIG_COUNT: '3',
      GIT_CONFIG_KEY_0: 'credential.helper',
      GIT_CONFIG_VALUE_0: '',
      GIT_CONFIG_KEY_1: 'credential.https://github.com.helper',
      GIT_CONFIG_VALUE_1: '!/opt/homebrew/bin/gh auth git-credential',
      GIT_ASKPASS: '/bin/false',
      DISPATCH_ORG: 'motorinn',
      HOME: '/Users/nobody',
      PATH: '/usr/bin',
      LANG: 'en_US.UTF-8',
    });
    expect(deferredKeys).toEqual([]);
    expect(Object.keys(env!).sort()).toEqual([
      'DISPATCH_ORG',
      'GIT_ASKPASS',
      'GIT_CONFIG_COUNT',
      'GIT_CONFIG_KEY_0',
      'GIT_CONFIG_KEY_1',
      'GIT_CONFIG_VALUE_0',
      'GIT_CONFIG_VALUE_1',
      'HOME',
      'LANG',
      'PATH',
    ]);
  });

  test('undefined env passes through untouched', () => {
    const { env, deferredKeys } = splitDeferredEnv(undefined);
    expect(env).toBeUndefined();
    expect(deferredKeys).toEqual([]);
  });
});

// ---- value-shape backstop ---------------------------------------------------

describe('splitDeferredEnv: value-shape backstop', () => {
  test('innocently named keys with credential-shaped values are deferred', () => {
    const cases: Array<[string, string]> = [
      ['SLACK_THING', 'xoxb-1111-2222-abcdef'],
      ['APP_LEVEL', 'xapp-1-A111-222-abc'],
      ['GH_CRED', 'ghp_0123456789abcdef0123456789abcdef'],
      ['GH_OAUTH', 'gho_0123456789abcdef0123456789abcdef'],
      ['NEW_PAT', 'github_pat_11ABC'],
      ['LINEAR_THING', 'lin_api_0123456789'],
      ['OPENISH', 'sk-proj-0123456789abcdef'],
      ['AWS_ID', 'AKIAIOSFODNN7EXAMPLE'],
      ['SB_ANON', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.x'],
      ['DB_CONN', 'postgresql://user:hunter2@db.example.com:5432/app'],
    ];
    for (const [key, value] of cases) {
      expect(isSensitiveEnvEntry(key, value)).toBe(true);
      const { deferredKeys } = splitDeferredEnv({ [key]: value });
      expect(deferredKeys).toEqual([key]);
    }
  });

  test('ordinary values do not trip the backstop', () => {
    const cases: Array<[string, string]> = [
      ['GREETING', 'hello world'],
      ['URL', 'https://example.com/path'],
      ['DB_HOST_ONLY', 'postgresql://db.example.com:5432/app'], // no password
      ['SKI_TRIP', 'sk-hi'], // too short for the sk- shape
      ['EMPTY', ''],
    ];
    for (const [key, value] of cases) {
      expect(isSensitiveEnvEntry(key, value)).toBe(false);
      const { deferredKeys, env } = splitDeferredEnv({ [key]: value });
      expect(deferredKeys).toEqual([]);
      expect(env).toEqual({ [key]: value });
    }
  });
});

// ---- applyDeferredEnv merge + fallback --------------------------------------

describe('applyDeferredEnv', () => {
  test('resolves deferred keys from the local env', () => {
    const child: Record<string, string> = { PATH: '/usr/bin' };
    const warned: string[] = [];
    applyDeferredEnv(child, ['GH_TOKEN'], { GH_TOKEN: 'local-value' }, (k) => warned.push(k));
    expect(child.GH_TOKEN).toBe('local-value');
    expect(warned).toEqual([]);
  });

  test('missing local keys warn by NAME and are skipped; job proceeds', () => {
    const child: Record<string, string> = {};
    const warned: string[] = [];
    applyDeferredEnv(child, ['LINEAR_API_KEY', 'GH_TOKEN'], { GH_TOKEN: 'x' }, (k) => warned.push(k));
    expect(child).toEqual({ GH_TOKEN: 'x' });
    expect(warned).toEqual(['LINEAR_API_KEY']);
  });

  test('no deferred keys is a no-op', () => {
    const child: Record<string, string> = { A: '1' };
    applyDeferredEnv(child, undefined, { B: '2' }, () => { throw new Error('no warn expected'); });
    applyDeferredEnv(child, [], { B: '2' }, () => { throw new Error('no warn expected'); });
    expect(child).toEqual({ A: '1' });
  });
});

// ---- validator shape --------------------------------------------------------

describe('validateShellJobParams: env_deferred_keys', () => {
  test('accepts an array of env-var-shaped names and passes it through', () => {
    const params = validateShellJobParams({
      cmd: 'true',
      cwd: '/tmp',
      env: { DISPATCH_ORG: 'motorinn' },
      env_deferred_keys: ['GH_TOKEN', 'LINEAR_API_KEY'],
    });
    expect(params.env_deferred_keys).toEqual(['GH_TOKEN', 'LINEAR_API_KEY']);
  });

  test('rejects non-array and non-name entries', () => {
    expect(() => validateShellJobParams({ cmd: 'true', cwd: '/tmp', env_deferred_keys: 'GH_TOKEN' }))
      .toThrow(UnrecoverableError);
    expect(() => validateShellJobParams({ cmd: 'true', cwd: '/tmp', env_deferred_keys: ['bad key'] }))
      .toThrow(UnrecoverableError);
    expect(() => validateShellJobParams({ cmd: 'true', cwd: '/tmp', env_deferred_keys: [42] }))
      .toThrow(UnrecoverableError);
  });

  test('old-format payloads (no env_deferred_keys) still validate', () => {
    const params = validateShellJobParams({ cmd: 'true', cwd: '/tmp', env: { GH_TOKEN: 'plain' } });
    expect(params.env_deferred_keys).toBeUndefined();
    expect(params.env).toEqual({ GH_TOKEN: 'plain' });
  });
});

// ---- end-to-end through the handler -----------------------------------------

describe('shellHandler: deferred-env merge at execution', () => {
  test('deferred key resolves from the WORKER process env into the child', async () => {
    process.env.GBRAIN_TEST_DEFERRED_SECRET_TOKEN = 'from-worker-local-env';
    try {
      const result = await shellHandler(makeCtx({
        cmd: 'printf "%s" "got:$GBRAIN_TEST_DEFERRED_SECRET_TOKEN"',
        cwd: '/tmp',
        env: { HARMLESS: 'kept' },
        env_deferred_keys: ['GBRAIN_TEST_DEFERRED_SECRET_TOKEN'],
      }));
      expect(result.exit_code).toBe(0);
      expect(result.stdout_tail).toBe('got:from-worker-local-env');
    } finally {
      delete process.env.GBRAIN_TEST_DEFERRED_SECRET_TOKEN;
    }
  });

  test('stored env still merges OVER the deferred/local baseline', async () => {
    process.env.GBRAIN_TEST_DEFERRED_SECRET_TOKEN = 'from-worker-local-env';
    try {
      const result = await shellHandler(makeCtx({
        cmd: 'printf "%s" "got:$GBRAIN_TEST_DEFERRED_SECRET_TOKEN"',
        cwd: '/tmp',
        env: { GBRAIN_TEST_DEFERRED_SECRET_TOKEN: 'explicit-stored-wins' },
        env_deferred_keys: ['GBRAIN_TEST_DEFERRED_SECRET_TOKEN'],
      }));
      expect(result.exit_code).toBe(0);
      expect(result.stdout_tail).toBe('got:explicit-stored-wins');
    } finally {
      delete process.env.GBRAIN_TEST_DEFERRED_SECRET_TOKEN;
    }
  });

  test('missing deferred key: child runs without it (loud warn, no throw)', async () => {
    delete process.env.GBRAIN_TEST_DEFERRED_SECRET_TOKEN;
    const result = await shellHandler(makeCtx({
      cmd: 'printf "%s" "got:${GBRAIN_TEST_DEFERRED_SECRET_TOKEN:-<unset>}"',
      cwd: '/tmp',
      env_deferred_keys: ['GBRAIN_TEST_DEFERRED_SECRET_TOKEN'],
    }));
    expect(result.exit_code).toBe(0);
    expect(result.stdout_tail).toBe('got:<unset>');
  });

  test('backward compatibility: legacy full-env rows execute unchanged', async () => {
    const result = await shellHandler(makeCtx({
      cmd: 'printf "%s" "legacy:$LEGACY_PLAINTEXT_VALUE"',
      cwd: '/tmp',
      env: { LEGACY_PLAINTEXT_VALUE: 'still-works' },
    }));
    expect(result.exit_code).toBe(0);
    expect(result.stdout_tail).toBe('legacy:still-works');
  });
});
