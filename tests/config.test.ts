import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadConfig } from '../src/config.ts';

test('server rejects non-local bind addresses', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rating-control-config-'));
  const originalHost = process.env.HOST;
  try {
    process.env.HOST = '0.0.0.0';
    assert.throws(() => loadConfig(directory), /loopback/);
  } finally {
    if (originalHost === undefined) delete process.env.HOST; else process.env.HOST = originalHost;
    fs.rmSync(directory, { recursive: true });
  }
});
