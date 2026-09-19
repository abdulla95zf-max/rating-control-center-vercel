import fs from 'node:fs';
import path from 'node:path';

export interface AppConfig {
  host: string;
  port: number;
  talabatDatabasePath: string;
  autoRefreshSeconds: number;
  publicDirectory: string;
  ratingsApiUrl?: string;
  ratingsApiToken?: string;
}

function loadEnv(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

export function loadConfig(projectRoot = process.cwd()): AppConfig {
  loadEnv(path.join(projectRoot, '.env'));
  const configuredDatabase = process.env.TALABAT_DB_PATH?.trim() ?? '';
  const host = process.env.HOST?.trim() || '127.0.0.1';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('HOST must be a local loopback address');
  return {
    host,
    port: positiveInteger('PORT', 3000),
    talabatDatabasePath: configuredDatabase ? path.resolve(projectRoot, configuredDatabase) : '',
    autoRefreshSeconds: positiveInteger('AUTO_REFRESH_SECONDS', 60),
    publicDirectory: path.join(projectRoot, 'public'),
    ratingsApiUrl: process.env.RATINGS_API_URL?.trim() || '',
    ratingsApiToken: process.env.RATINGS_API_TOKEN || ''
  };
}
