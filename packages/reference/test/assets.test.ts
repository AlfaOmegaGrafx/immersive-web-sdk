/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createHash } from 'crypto';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import * as tar from 'tar';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getReferenceCacheStatus,
  getReferencePackageVersion,
  resolveReferenceAssets,
  warmupReferenceAssets,
} from '../src/assets.js';

const ASSETS_PACKAGE_NAME = '@iwsdk/reference-assets';
const TEST_MODEL = {
  source: 'archive',
  format: 'transformers-js',
  archiveSha256: 'model-hash',
  archiveSize: 123,
  dtype: 'q8',
  pooling: 'mean',
  normalize: true,
} as const;

let tempDir: string;
let workspaceRoot: string;
let sharedRoot: string;

async function writeStateFile(payload: Record<string, unknown>) {
  const statePath = path.join(
    workspaceRoot,
    '.iwsdk',
    'reference',
    'state.json',
  );
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function seedModelDir() {
  const modelDir = path.join(
    sharedRoot,
    'models',
    TEST_MODEL.archiveSha256,
    'model',
  );
  await mkdir(path.join(modelDir, 'onnx'), { recursive: true });
  await writeFile(path.join(modelDir, 'config.json'), '{}\n', 'utf8');
  await writeFile(path.join(modelDir, 'tokenizer.json'), '{}\n', 'utf8');
  await writeFile(path.join(modelDir, 'tokenizer_config.json'), '{}\n', 'utf8');
  await writeFile(
    path.join(modelDir, 'onnx', 'model_quantized.onnx'),
    'onnx',
    'utf8',
  );
  return modelDir;
}

async function createArchive(
  rootName: string,
  files: Record<string, string>,
): Promise<{ buffer: Buffer; sha256: string; size: number }> {
  const sourceRoot = path.join(tempDir, `${rootName}-source`);
  const archivePath = path.join(tempDir, `${rootName}.tgz`);
  const archiveRoot = path.join(sourceRoot, rootName);

  await rm(sourceRoot, { recursive: true, force: true });
  await mkdir(archiveRoot, { recursive: true });
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(archiveRoot, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, 'utf8');
  }

  await tar.c(
    {
      cwd: sourceRoot,
      file: archivePath,
      gzip: true,
      portable: true,
      noPax: true,
      mtime: new Date(0),
    },
    [rootName],
  );

  const buffer = await readFile(archivePath);
  return {
    buffer,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    size: buffer.length,
  };
}

beforeEach(async () => {
  tempDir = path.join(
    os.tmpdir(),
    `iwsdk-reference-assets-test-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`,
  );
  workspaceRoot = path.join(tempDir, 'app');
  sharedRoot = path.join(tempDir, 'shared');
  await mkdir(workspaceRoot, { recursive: true });
  await writeFile(
    path.join(workspaceRoot, 'package.json'),
    '{ "name": "fixture-app", "private": true }\n',
    'utf8',
  );
  process.env.IWSDK_REFERENCE_WORKSPACE_ROOT = workspaceRoot;
  process.env.IWSDK_REFERENCE_CACHE_DIR = sharedRoot;
  process.env.IWSDK_REFERENCE_ASSETS_BASE_URL = 'https://cdn.example.test';
});

afterEach(async () => {
  delete process.env.IWSDK_REFERENCE_CACHE_DIR;
  delete process.env.IWSDK_REFERENCE_WORKSPACE_ROOT;
  delete process.env.IWSDK_REFERENCE_ASSETS_BASE_URL;
  delete process.env.IWSDK_REFERENCE_MODEL_URL;
  vi.unstubAllGlobals();
  await rm(tempDir, { recursive: true, force: true });
});

describe('reference cache status', () => {
  it('reports not_started when no cache state exists', async () => {
    const status = await getReferenceCacheStatus();
    expect(status.initState).toBe('not_started');
    expect(status.warmupRequired).toBe(true);
    expect(status.dataDir).toBeNull();
    expect(status.stateRoot).toBe(
      path.join(workspaceRoot, '.iwsdk', 'reference'),
    );
    expect(status.sharedDataRoot).toBe(path.join(sharedRoot, 'corpora'));
    expect(status.sharedModelRoot).toBe(path.join(sharedRoot, 'models'));
  });

  it('treats stale in-progress state as failed', async () => {
    const packageVersion = getReferencePackageVersion();
    await writeStateFile({
      schemaVersion: 3,
      packageVersion,
      assetsPackage: {
        name: ASSETS_PACKAGE_NAME,
        version: packageVersion,
      },
      status: 'in_progress',
      pid: 999999,
      manifestUrl: null,
      dataDir: null,
      dataSha256: null,
      modelDir: null,
      modelSha256: null,
      modelUrl: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      updatedAt: new Date().toISOString(),
      error: null,
    });

    const status = await getReferenceCacheStatus();
    expect(status.initState).toBe('failed');
    expect(status.error?.message).toContain('interrupted');
  });

  it('resolves warmed assets from the validated cache', async () => {
    const packageVersion = getReferencePackageVersion();
    const dataDir = path.join(sharedRoot, 'corpora', 'data-hash', 'data');
    const modelDir = await seedModelDir();
    await mkdir(path.join(dataDir, 'sources'), { recursive: true });
    await writeFile(
      path.join(dataDir, 'embeddings.json'),
      `${JSON.stringify(
        {
          version: packageVersion,
          model: TEST_MODEL,
          dimensions: 768,
          iwsdk: [],
          deps: [],
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    await writeStateFile({
      schemaVersion: 3,
      packageVersion,
      assetsPackage: {
        name: ASSETS_PACKAGE_NAME,
        version: packageVersion,
      },
      status: 'ready',
      pid: null,
      manifestUrl: 'https://cdn.example.test/manifest.json',
      dataDir,
      dataSha256: 'data-hash',
      modelDir,
      modelSha256: TEST_MODEL.archiveSha256,
      modelUrl: 'https://cdn.example.test/model.tgz',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
    });

    const resolved = await resolveReferenceAssets();
    expect(resolved.dataDir).toBe(dataDir);
    expect(resolved.modelDir).toBe(modelDir);
    expect(resolved.model).toEqual(TEST_MODEL);
  });

  it('allows a warmed custom corpus source when no explicit override is set', async () => {
    const packageVersion = getReferencePackageVersion();
    const dataDir = path.join(sharedRoot, 'corpora', 'data-hash', 'data');
    const modelDir = await seedModelDir();
    await mkdir(path.join(dataDir, 'sources'), { recursive: true });
    await writeFile(
      path.join(dataDir, 'embeddings.json'),
      `${JSON.stringify(
        {
          version: packageVersion,
          model: TEST_MODEL,
          dimensions: 768,
          iwsdk: [],
          deps: [],
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    await writeStateFile({
      schemaVersion: 3,
      packageVersion,
      assetsPackage: {
        name: ASSETS_PACKAGE_NAME,
        version: packageVersion,
      },
      status: 'ready',
      pid: null,
      manifestUrl:
        'http://127.0.0.1:8791/packages/reference-assets/dist/manifest.json',
      dataDir,
      dataSha256: 'data-hash',
      modelDir,
      modelSha256: TEST_MODEL.archiveSha256,
      modelUrl:
        'http://127.0.0.1:8791/packages/reference-assets/model-dist/model.tgz',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
    });

    delete process.env.IWSDK_REFERENCE_ASSETS_BASE_URL;

    const status = await getReferenceCacheStatus();
    expect(status.initState).toBe('ready');
    expect(status.warmupRequired).toBe(false);
  });

  it('downloads both corpus and model archives during warmup', async () => {
    const packageVersion = getReferencePackageVersion();
    const modelArchive = await createArchive('model', {
      'config.json': '{}\n',
      'tokenizer.json': '{}\n',
      'tokenizer_config.json': '{}\n',
      'onnx/model_quantized.onnx': 'onnx',
    });
    const dataArchive = await createArchive('data', {
      'embeddings.json': `${JSON.stringify(
        {
          version: packageVersion,
          model: {
            ...TEST_MODEL,
            archiveSha256: modelArchive.sha256,
            archiveSize: modelArchive.size,
          },
          dimensions: 768,
          iwsdk: [],
          deps: [],
        },
        null,
        2,
      )}\n`,
      'sources/.keep': '',
    });

    process.env.IWSDK_REFERENCE_MODEL_URL =
      'https://models.example.test/model.tgz';
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === 'https://cdn.example.test/manifest.json') {
        return new Response(
          JSON.stringify({
            schemaVersion: 3,
            referenceVersion: packageVersion,
            assetsPackage: {
              name: ASSETS_PACKAGE_NAME,
              version: packageVersion,
            },
            generatedAt: new Date().toISOString(),
            assets: {
              data: {
                file: 'data.tgz',
                sha256: dataArchive.sha256,
                size: dataArchive.size,
              },
            },
          }),
          { status: 200 },
        );
      }
      if (url === 'https://cdn.example.test/data.tgz') {
        return new Response(dataArchive.buffer, {
          status: 200,
          headers: {
            'content-length': String(dataArchive.size),
          },
        });
      }
      if (url === 'https://models.example.test/model.tgz') {
        return new Response(modelArchive.buffer, {
          status: 200,
          headers: {
            'content-length': String(modelArchive.size),
          },
        });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const status = await warmupReferenceAssets();

    expect(status.initState).toBe('ready');
    expect(status.dataSha256).toBe(dataArchive.sha256);
    expect(status.modelSha256).toBe(modelArchive.sha256);
    expect(status.modelUrl).toBe('https://models.example.test/model.tgz');
    expect(status.dataDir).toBe(
      path.join(sharedRoot, 'corpora', dataArchive.sha256, 'data'),
    );
    expect(status.modelDir).toBe(
      path.join(sharedRoot, 'models', modelArchive.sha256, 'model'),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://cdn.example.test/manifest.json',
    );
    expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.test/data.tgz');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://models.example.test/model.tgz',
    );
  });

  it('fails warmup clearly when the model URL is missing', async () => {
    const packageVersion = getReferencePackageVersion();
    const modelArchive = await createArchive('model', {
      'config.json': '{}\n',
      'tokenizer.json': '{}\n',
      'tokenizer_config.json': '{}\n',
      'onnx/model_quantized.onnx': 'onnx',
    });
    const dataArchive = await createArchive('data', {
      'embeddings.json': `${JSON.stringify(
        {
          version: packageVersion,
          model: {
            ...TEST_MODEL,
            archiveSha256: modelArchive.sha256,
            archiveSize: modelArchive.size,
          },
          dimensions: 768,
          iwsdk: [],
          deps: [],
        },
        null,
        2,
      )}\n`,
      'sources/.keep': '',
    });

    delete process.env.IWSDK_REFERENCE_MODEL_URL;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === 'https://cdn.example.test/manifest.json') {
        return new Response(
          JSON.stringify({
            schemaVersion: 3,
            referenceVersion: packageVersion,
            assetsPackage: {
              name: ASSETS_PACKAGE_NAME,
              version: packageVersion,
            },
            generatedAt: new Date().toISOString(),
            assets: {
              data: {
                file: 'data.tgz',
                sha256: dataArchive.sha256,
                size: dataArchive.size,
              },
            },
          }),
          { status: 200 },
        );
      }
      if (url === 'https://cdn.example.test/data.tgz') {
        return new Response(dataArchive.buffer, {
          status: 200,
          headers: {
            'content-length': String(dataArchive.size),
          },
        });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(warmupReferenceAssets()).rejects.toThrow(
      'IWSDK_REFERENCE_MODEL_URL',
    );
  });

  it('reports a mismatch when the warmed model does not match the corpus metadata', async () => {
    const packageVersion = getReferencePackageVersion();
    const dataDir = path.join(sharedRoot, 'corpora', 'data-hash', 'data');
    const modelDir = await seedModelDir();
    await mkdir(path.join(dataDir, 'sources'), { recursive: true });
    await writeFile(
      path.join(dataDir, 'embeddings.json'),
      `${JSON.stringify(
        {
          version: packageVersion,
          model: {
            ...TEST_MODEL,
            archiveSha256: 'different-model-hash',
          },
          dimensions: 768,
          iwsdk: [],
          deps: [],
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    await writeStateFile({
      schemaVersion: 3,
      packageVersion,
      assetsPackage: {
        name: ASSETS_PACKAGE_NAME,
        version: packageVersion,
      },
      status: 'ready',
      pid: null,
      manifestUrl: 'https://cdn.example.test/manifest.json',
      dataDir,
      dataSha256: 'data-hash',
      modelDir,
      modelSha256: TEST_MODEL.archiveSha256,
      modelUrl: 'https://cdn.example.test/model.tgz',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
    });

    const status = await getReferenceCacheStatus();
    expect(status.initState).toBe('failed');
    expect(status.error?.message).toContain('does not match');
  });
});
