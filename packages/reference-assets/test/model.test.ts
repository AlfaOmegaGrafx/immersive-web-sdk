/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import * as tar from 'tar';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatReferenceEmbeddingModel,
  installReferenceEmbeddingModel,
} from '../tools/model.js';

let tempDir: string;
let archiveBuffer: Buffer;
let sharedRoot: string;

beforeEach(async () => {
  tempDir = path.join(
    os.tmpdir(),
    `iwsdk-reference-model-test-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`,
  );
  sharedRoot = path.join(tempDir, 'shared');
  const packageRoot = path.join(tempDir, 'package');
  const modelRoot = path.join(packageRoot, 'model');
  const archivePath = path.join(tempDir, 'model.tgz');

  await mkdir(path.join(modelRoot, 'onnx'), { recursive: true });
  await writeFile(path.join(modelRoot, 'config.json'), '{}\n', 'utf8');
  await writeFile(path.join(modelRoot, 'tokenizer.json'), '{}\n', 'utf8');
  await writeFile(
    path.join(modelRoot, 'tokenizer_config.json'),
    '{}\n',
    'utf8',
  );
  await writeFile(
    path.join(modelRoot, 'onnx', 'model_quantized.onnx'),
    'onnx',
    'utf8',
  );
  await tar.c(
    {
      cwd: packageRoot,
      file: archivePath,
      gzip: true,
      portable: true,
      noPax: true,
      mtime: new Date(0),
    },
    ['model'],
  );
  archiveBuffer = await readFile(archivePath);

  process.env.IWSDK_REFERENCE_CACHE_DIR = sharedRoot;
  process.env.IWSDK_REFERENCE_MODEL_URL =
    'https://models.example.test/model.tgz';
});

afterEach(async () => {
  delete process.env.IWSDK_REFERENCE_CACHE_DIR;
  delete process.env.IWSDK_REFERENCE_MODEL_URL;
  vi.unstubAllGlobals();
  await rm(tempDir, { recursive: true, force: true });
});

describe('reference model installer', () => {
  it('downloads and installs the configured model archive', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(archiveBuffer, {
          status: 200,
          headers: {
            'content-length': String(archiveBuffer.length),
          },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const installed = await installReferenceEmbeddingModel();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://models.example.test/model.tgz',
    );
    expect(installed.sourceUrl).toBe('https://models.example.test/model.tgz');
    expect(installed.metadata).toMatchObject({
      source: 'archive',
      format: 'transformers-js',
      archiveSize: archiveBuffer.length,
      dtype: 'q8',
      pooling: 'mean',
      normalize: true,
    });
    expect(installed.metadata.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(formatReferenceEmbeddingModel(installed.metadata)).toBe(
      `sha256:${installed.metadata.archiveSha256}`,
    );
  });

  it('reuses the extracted cache path when the same archive is downloaded again', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(archiveBuffer, {
          status: 200,
          headers: {
            'content-length': String(archiveBuffer.length),
          },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const firstInstall = await installReferenceEmbeddingModel();
    const secondInstall = await installReferenceEmbeddingModel();

    expect(firstInstall.modelDir).toBe(secondInstall.modelDir);
    expect(secondInstall.metadata.archiveSha256).toBe(
      firstInstall.metadata.archiveSha256,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails clearly when the model URL is missing', async () => {
    delete process.env.IWSDK_REFERENCE_MODEL_URL;

    await expect(installReferenceEmbeddingModel()).rejects.toThrow(
      'IWSDK_REFERENCE_MODEL_URL',
    );
  });
});
