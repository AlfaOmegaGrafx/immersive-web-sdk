#!/usr/bin/env node
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as tar from 'tar';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(packageRoot, 'model-dist');
const sourceDir = path.join(packageRoot, 'model');
const ALLOW_MISSING = process.argv.includes('--if-ready');
const REQUIRED_MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  path.join('onnx', 'model_quantized.onnx'),
];

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function validateSourceDir() {
  try {
    await fsp.access(sourceDir);
  } catch {
    if (ALLOW_MISSING) {
      return false;
    }
    throw new Error(
      'Missing model/ in @iwsdk/reference-assets. Ensure the local model snapshot is present before building model.tgz.',
    );
  }

  for (const relativePath of REQUIRED_MODEL_FILES) {
    try {
      await fsp.access(path.join(sourceDir, relativePath));
    } catch {
      if (ALLOW_MISSING) {
        return false;
      }
      throw new Error(`Model source is missing ${relativePath}.`);
    }
  }

  return true;
}

async function main() {
  const packageJson = JSON.parse(
    await fsp.readFile(path.join(packageRoot, 'package.json'), 'utf8'),
  );

  const ready = await validateSourceDir();
  if (!ready) {
    process.stdout.write(
      'Skipping model packaging because the local model snapshot is not present yet.\n',
    );
    await fsp.rm(outputRoot, { recursive: true, force: true });
    return;
  }

  await fsp.rm(outputRoot, { recursive: true, force: true });
  await fsp.mkdir(outputRoot, { recursive: true });

  const archivePath = path.join(outputRoot, 'model.tgz');
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

  const archiveStat = await fsp.stat(archivePath);
  const archiveSha256 = await sha256File(archivePath);
  const manifest = {
    schemaVersion: 1,
    referenceVersion: packageJson.version,
    generatedAt: new Date().toISOString(),
    model: {
      file: 'model.tgz',
      sha256: archiveSha256,
      size: archiveStat.size,
      format: 'transformers-js',
      requiredFiles: REQUIRED_MODEL_FILES,
    },
  };

  await fsp.writeFile(
    path.join(outputRoot, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  await fsp.writeFile(
    path.join(outputRoot, 'model.tgz.sha256'),
    `${archiveSha256}  model.tgz\n`,
    'utf8',
  );

  process.stdout.write(
    `Built reference model artifact in ${outputRoot} (${archiveStat.size} B model)\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `Failed to build reference model artifact: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exit(1);
});
