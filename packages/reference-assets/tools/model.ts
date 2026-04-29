import { createHash } from 'crypto';
import { createReadStream, createWriteStream, existsSync } from 'fs';
import { mkdir, rename, rm, stat } from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import * as tar from 'tar';

export type ReferenceEmbeddingModelDType =
  | 'auto'
  | 'fp32'
  | 'fp16'
  | 'q8'
  | 'int8'
  | 'uint8'
  | 'q4'
  | 'bnb4'
  | 'q4f16';

export interface ReferenceEmbeddingModelMetadata {
  source: 'archive';
  format: 'transformers-js';
  archiveSha256: string;
  archiveSize: number;
  dtype: ReferenceEmbeddingModelDType;
  pooling: 'mean';
  normalize: true;
}

export interface InstalledReferenceEmbeddingModel {
  metadata: ReferenceEmbeddingModelMetadata;
  modelDir: string;
  sourceUrl: string;
}

const REQUIRED_MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  path.join('onnx', 'model_quantized.onnx'),
] as const;

const DEFAULT_REFERENCE_MODEL_SETTINGS = {
  source: 'archive',
  format: 'transformers-js',
  dtype: 'q8',
  pooling: 'mean',
  normalize: true,
} as const;

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function getDefaultSharedCacheRoot(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches', 'iwsdk', 'reference');
  }

  if (process.platform === 'win32') {
    return path.join(
      process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'),
      'iwsdk',
      'reference',
    );
  }

  return path.join(
    process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache'),
    'iwsdk',
    'reference',
  );
}

export function getReferenceSharedCacheRoot(): string {
  const override = process.env.IWSDK_REFERENCE_CACHE_DIR;
  return path.resolve(override ? override : getDefaultSharedCacheRoot());
}

export function getReferenceModelsRoot(
  sharedRoot = getReferenceSharedCacheRoot(),
): string {
  return path.join(sharedRoot, 'models');
}

function getReferenceModelStagingRoot(
  sharedRoot = getReferenceSharedCacheRoot(),
): string {
  return path.join(sharedRoot, 'staging', 'reference-assets-model');
}

export function getReferenceModelUrl(): string | null {
  const override = process.env.IWSDK_REFERENCE_MODEL_URL?.trim();
  return override ? override : null;
}

export function getReferenceBundledModelSourceDir(): string {
  return path.join(PACKAGE_ROOT, 'model');
}

export function getReferenceModelOutputRoot(): string {
  return path.join(PACKAGE_ROOT, 'model-dist');
}

function buildReferenceEmbeddingModelMetadata(
  archiveSha256: string,
  archiveSize: number,
): ReferenceEmbeddingModelMetadata {
  return {
    ...DEFAULT_REFERENCE_MODEL_SETTINGS,
    archiveSha256,
    archiveSize,
  };
}

export function formatReferenceEmbeddingModel(
  model: ReferenceEmbeddingModelMetadata,
): string {
  return `sha256:${model.archiveSha256}`;
}

export function hasReferenceEmbeddingModelFiles(
  modelDir: string | null,
): boolean {
  if (!modelDir) {
    return false;
  }

  return REQUIRED_MODEL_FILES.every((relativePath) =>
    existsSync(path.join(modelDir, relativePath)),
  );
}

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function writeResponseToFile(
  response: Response,
  destination: string,
  sourceUrl: string,
): Promise<void> {
  if (!response.body) {
    throw new Error(`No response body received from ${sourceUrl}`);
  }

  const fileStream = createWriteStream(destination);
  const reader = response.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = Buffer.from(value);
      if (!fileStream.write(chunk)) {
        await new Promise<void>((resolve) => fileStream.once('drain', resolve));
      }
    }

    fileStream.end();
    await new Promise<void>((resolve, reject) => {
      fileStream.once('finish', resolve);
      fileStream.once('error', reject);
    });
  } catch (error) {
    fileStream.destroy();
    throw error;
  }
}

async function downloadReferenceModelArchive(
  sourceUrl: string,
  destination: string,
): Promise<ReferenceEmbeddingModelMetadata> {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Unable to fetch ${sourceUrl}: HTTP ${response.status}`);
  }

  await writeResponseToFile(response, destination, sourceUrl);
  const archiveStat = await stat(destination);
  return buildReferenceEmbeddingModelMetadata(
    await sha256File(destination),
    archiveStat.size,
  );
}

async function installExtractedModel(
  archivePath: string,
  metadata: ReferenceEmbeddingModelMetadata,
  sharedRoot = getReferenceSharedCacheRoot(),
): Promise<string> {
  const finalRoot = path.join(
    getReferenceModelsRoot(sharedRoot),
    metadata.archiveSha256,
  );
  const finalDir = path.join(finalRoot, 'model');
  if (hasReferenceEmbeddingModelFiles(finalDir)) {
    return finalDir;
  }

  const extractRoot = `${archivePath}.extract`;
  await rm(extractRoot, { recursive: true, force: true });
  await mkdir(extractRoot, { recursive: true });
  await tar.x({
    file: archivePath,
    cwd: extractRoot,
  });

  const extractedDir = path.join(extractRoot, 'model');
  if (!hasReferenceEmbeddingModelFiles(extractedDir)) {
    throw new Error(
      'Extracted model archive is missing expected files. Ensure IWSDK_REFERENCE_MODEL_URL points at a valid model.tgz built from packages/reference-assets/model.',
    );
  }

  await mkdir(path.dirname(finalRoot), { recursive: true });
  const tempFinalRoot = `${finalRoot}.tmp-${process.pid}-${Date.now()}`;
  await rm(tempFinalRoot, { recursive: true, force: true });
  await rename(extractRoot, tempFinalRoot);

  try {
    await rename(tempFinalRoot, finalRoot);
  } catch (error) {
    await rm(tempFinalRoot, { recursive: true, force: true });
    if (!hasReferenceEmbeddingModelFiles(finalDir)) {
      throw error;
    }
  }

  return finalDir;
}

export async function installReferenceEmbeddingModel(): Promise<InstalledReferenceEmbeddingModel> {
  const sourceUrl = getReferenceModelUrl();
  if (!sourceUrl) {
    throw new Error(
      'IWSDK_REFERENCE_MODEL_URL must be set before running reference ingestion.',
    );
  }

  const sharedRoot = getReferenceSharedCacheRoot();
  const stagingRoot = path.join(
    getReferenceModelStagingRoot(sharedRoot),
    `${Date.now()}-${process.pid}`,
  );
  const archivePath = path.join(stagingRoot, 'model.tgz');

  try {
    await mkdir(getReferenceModelsRoot(sharedRoot), { recursive: true });
    await mkdir(stagingRoot, { recursive: true });

    const metadata = await downloadReferenceModelArchive(
      trimTrailingSlash(sourceUrl),
      archivePath,
    );
    const modelDir = await installExtractedModel(
      archivePath,
      metadata,
      sharedRoot,
    );
    return {
      metadata,
      modelDir,
      sourceUrl: trimTrailingSlash(sourceUrl),
    };
  } finally {
    await rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
  }
}
