/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdir, readFile, realpath, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  getManagedMcpServerRegistry,
  mergeJsonConfig,
  mergeTomlConfig,
  pruneMcpAdapters,
  syncMcpAdapters,
} from '../src/mcp-adapters.js';
import { readAdapterStatus } from '../src/commands/adapter.js';

let tempDir: string;
let appA: string;

async function createAppFixture(root: string) {
  await mkdir(root, { recursive: true });
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify(
      {
        name: 'fixture-app',
        private: true,
        devDependencies: {
          '@iwsdk/vite-plugin-dev': 'workspace:*',
        },
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  await writeFile(
    path.join(root, 'vite.config.ts'),
    'export default {}\n',
    'utf8',
  );
}

beforeEach(async () => {
  tempDir = path.join(
    os.tmpdir(),
    `iwsdk-mcp-adapters-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  appA = path.join(tempDir, 'apps', 'app-a');
  await createAppFixture(appA);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('managed MCP registry', () => {
  test('builds the managed server registry from the local CLI front door', async () => {
    const normalizedAppA = await realpath(appA);
    const cliEntrypoint = path.join(
      normalizedAppA,
      'node_modules',
      '@iwsdk',
      'cli',
      'dist',
      'cli.js',
    );
    const referenceEntrypoint = path.join(
      normalizedAppA,
      'node_modules',
      '@iwsdk',
      'reference',
      'dist',
      'cli.js',
    );
    const hzdbMarker = path.join(
      normalizedAppA,
      'node_modules',
      '@meta-quest',
      'hzdb',
      'package.json',
    );
    await mkdir(path.dirname(cliEntrypoint), { recursive: true });
    await mkdir(path.dirname(referenceEntrypoint), { recursive: true });
    await mkdir(path.dirname(hzdbMarker), { recursive: true });
    await writeFile(cliEntrypoint, '', 'utf8');
    await writeFile(referenceEntrypoint, '', 'utf8');
    await writeFile(hzdbMarker, '{}\n', 'utf8');

    const registry = getManagedMcpServerRegistry({ workspaceRoot: appA });
    expect(Object.keys(registry.entries)).toEqual([
      'iwsdk-runtime',
      'iwsdk-reference',
      'hzdb',
    ]);
    expect(registry.entries['iwsdk-runtime']?.command).toBe('node');
    expect(registry.entries['iwsdk-runtime']?.args).toContain(cliEntrypoint);
    expect(registry.entries['iwsdk-runtime']?.args).toContain('mcp');
    expect(registry.entries['iwsdk-runtime']?.args).toContain('stdio');
    expect(registry.entries['iwsdk-runtime']?.args).not.toContain(
      '--workspace',
    );
  });
});

describe('adapter helpers', () => {
  test('merges managed JSON entries without removing user-owned siblings', async () => {
    const filePath = path.join(tempDir, 'config', '.mcp.json');
    await mergeJsonConfig(
      filePath,
      { 'iwsdk-runtime': { command: 'iwsdk', args: ['mcp', 'stdio'] } },
      'mcpServers',
      ['iwsdk-runtime'],
    );
    await mergeJsonConfig(
      filePath,
      {
        'iwsdk-runtime': {
          command: 'iwsdk',
          args: ['mcp', 'stdio', '--verbose'],
        },
      },
      'mcpServers',
      ['iwsdk-runtime'],
    );

    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    expect(parsed.mcpServers['iwsdk-runtime'].args).toEqual([
      'mcp',
      'stdio',
      '--verbose',
    ]);
  });

  test('rewrites managed TOML blocks idempotently', async () => {
    const filePath = path.join(tempDir, 'config', '.codex', 'config.toml');
    await mergeTomlConfig(
      filePath,
      {
        'iwsdk-runtime': { command: 'iwsdk', args: ['mcp', 'stdio'] },
      },
      ['iwsdk-runtime'],
    );
    await mergeTomlConfig(
      filePath,
      {
        'iwsdk-runtime': {
          command: 'iwsdk',
          args: ['mcp', 'stdio', '--verbose'],
        },
      },
      ['iwsdk-runtime'],
    );

    const content = await readFile(filePath, 'utf8');
    expect(content.match(/IWER managed/g)?.length).toBe(2);
    expect(content).toContain('command = "iwsdk"');
    expect(content).toContain('"--verbose"');
  });

  test('syncs stable MCP adapter configs without embedding live ports or workspace args', async () => {
    const result = await syncMcpAdapters({
      workspaceRoot: appA,
      tools: ['claude', 'cursor', 'codex'],
    });

    const claude = JSON.parse(
      await readFile(path.join(appA, '.mcp.json'), 'utf8'),
    );
    const cursor = JSON.parse(
      await readFile(path.join(appA, '.cursor', 'mcp.json'), 'utf8'),
    );
    const codex = await readFile(
      path.join(appA, '.codex', 'config.toml'),
      'utf8',
    );
    const normalizedAppA = await realpath(appA);

    expect(result.serverNames).toContain('iwsdk-runtime');
    expect(claude.mcpServers['iwsdk-runtime'].command).toBe('node');
    expect(claude.mcpServers['iwsdk-runtime'].args).toContain(
      path.join(
        normalizedAppA,
        'node_modules',
        '@iwsdk',
        'cli',
        'dist',
        'cli.js',
      ),
    );
    expect(claude.mcpServers['iwsdk-runtime'].args).toContain('mcp');
    expect(claude.mcpServers['iwsdk-runtime'].args).toContain('stdio');
    expect(claude.mcpServers['iwsdk-runtime'].args).not.toContain(
      '--workspace',
    );
    expect(cursor.mcpServers['iwsdk-runtime'].command).toBe('node');
    expect(codex).toContain('[mcp_servers.iwsdk-runtime]');
    expect(codex).not.toContain('iwsdk-dev-mcp');
    expect(codex).not.toContain('--port');
    expect(codex).not.toContain('--workspace');
  });

  test('migrates legacy JSON entries while preserving user-owned siblings', async () => {
    const filePath = path.join(appA, '.mcp.json');
    await writeFile(
      filePath,
      JSON.stringify(
        {
          mcpServers: {
            iwsdk: {
              command: 'node',
              args: ['legacy.js', 'mcp', 'stdio', '--workspace', appA],
            },
            'iwsdk-dev-mcp': {
              command: 'node',
              args: ['legacy.js', '--port', '8081'],
            },
            'iwsdk-rag-local': {
              command: 'node',
              args: ['reference.js'],
            },
            'user-owned': {
              command: 'node',
              args: ['user.js'],
            },
          },
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );

    await syncMcpAdapters({
      workspaceRoot: appA,
      tools: ['claude'],
    });

    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    expect(parsed.mcpServers.iwsdk).toBeUndefined();
    expect(parsed.mcpServers['iwsdk-dev-mcp']).toBeUndefined();
    expect(parsed.mcpServers['iwsdk-rag-local']).toBeUndefined();
    expect(parsed.mcpServers['user-owned']).toEqual({
      command: 'node',
      args: ['user.js'],
    });
    expect(parsed.mcpServers['iwsdk-runtime'].args).not.toContain(
      '--workspace',
    );
  });

  test('prunes legacy TOML sections outside the managed block', async () => {
    const filePath = path.join(appA, '.codex', 'config.toml');
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      [
        '[mcp_servers.iwsdk-dev-mcp]',
        'command = "node"',
        'args = ["legacy.js", "--port", "8081"]',
        '',
        '[mcp_servers.iwsdk]',
        'command = "node"',
        'args = ["legacy.js", "mcp", "stdio", "--workspace", "/tmp/old"]',
        '',
        '[mcp_servers.iwsdk-rag-local]',
        'command = "node"',
        'args = ["reference.js"]',
        '',
        '[mcp_servers.user_owned]',
        'command = "node"',
        'args = ["user.js"]',
        '',
      ].join('\n'),
      'utf8',
    );

    await syncMcpAdapters({
      workspaceRoot: appA,
      tools: ['codex'],
    });

    const synced = await readFile(filePath, 'utf8');
    expect(synced).toContain('[mcp_servers.iwsdk-runtime]');
    expect(synced).toContain('[mcp_servers.user_owned]');
    expect(synced).not.toContain('[mcp_servers.iwsdk]');
    expect(synced).not.toContain('[mcp_servers.iwsdk-dev-mcp]');
    expect(synced).not.toContain('[mcp_servers.iwsdk-rag-local]');

    await pruneMcpAdapters({
      workspaceRoot: appA,
      tools: ['codex'],
    });

    const pruned = await readFile(filePath, 'utf8');
    expect(pruned).toContain('[mcp_servers.user_owned]');
    expect(pruned).not.toContain('[mcp_servers.iwsdk-runtime]');
    expect(pruned).not.toContain('[mcp_servers.iwsdk]');
    expect(pruned).not.toContain('[mcp_servers.iwsdk-dev-mcp]');
    expect(pruned).not.toContain('[mcp_servers.iwsdk-rag-local]');
  });

  test('reports legacy names and workspace-bound args as stale', async () => {
    await writeFile(
      path.join(appA, '.mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            iwsdk: {
              command: 'node',
              args: ['legacy.js', 'mcp', 'stdio'],
            },
          },
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
    await mkdir(path.join(appA, '.cursor'), { recursive: true });
    await writeFile(
      path.join(appA, '.cursor', 'mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            'iwsdk-rag-local': {
              command: 'node',
              args: ['reference.js'],
            },
          },
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
    await mkdir(path.join(appA, '.codex'), { recursive: true });
    await writeFile(
      path.join(appA, '.codex', 'config.toml'),
      [
        '[mcp_servers.iwsdk-runtime]',
        'command = "node"',
        'args = ["cli.js", "mcp", "stdio", "--workspace", "/tmp/old"]',
        '',
      ].join('\n'),
      'utf8',
    );

    const adapters = await readAdapterStatus(appA);
    expect(adapters.find((entry) => entry.tool === 'claude')?.status).toBe(
      'stale',
    );
    expect(adapters.find((entry) => entry.tool === 'cursor')?.status).toBe(
      'stale',
    );
    expect(adapters.find((entry) => entry.tool === 'codex')?.status).toBe(
      'stale',
    );
  });
});
