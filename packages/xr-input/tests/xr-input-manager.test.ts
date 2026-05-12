/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  WebXRManager,
} from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type XRInputManagerConstructor =
  typeof import('../src/xr-input-manager.js').XRInputManager;
type XRInputManagerInstance = InstanceType<XRInputManagerConstructor>;

let XRInputManager: XRInputManagerConstructor;

beforeAll(async () => {
  vi.stubGlobal('document', {
    createElement: vi.fn((tagName: string) => {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected element created in test: ${tagName}`);
      }
      return createMockCanvas();
    }),
  });

  ({ XRInputManager } = await import('../src/xr-input-manager.js'));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('XRInputManager pointer visuals', () => {
  it('hides ray and cursor visuals immediately after construction', () => {
    const manager = createManager();
    const rays = getRayMeshes(manager);
    const cursors = getCursorMeshes(manager);

    expect(rays).toHaveLength(2);
    expect(cursors).toHaveLength(2);
    for (const ray of rays) {
      expect(ray.visible).toBe(false);
      expect((ray.material as ShaderMaterial).uniforms.opacity.value).toBe(0);
    }
    for (const cursor of cursors) {
      expect(cursor.visible).toBe(false);
    }
  });

  it('keeps pointer visuals hidden when there is no XR session', () => {
    const manager = createManager();
    const rays = getRayMeshes(manager);
    const cursors = getCursorMeshes(manager);

    for (const visual of [...rays, ...cursors]) {
      visual.visible = true;
    }

    manager.update(createNoSessionXRManager(), 1 / 60, 1);

    for (const visual of [...rays, ...cursors]) {
      expect(visual.visible).toBe(false);
    }
  });
});

function createManager(): XRInputManagerInstance {
  return new XRInputManager({
    camera: new PerspectiveCamera(),
    scene: new Scene(),
  });
}

function getRayMeshes(manager: XRInputManagerInstance): Mesh[] {
  return [
    getOnlyMesh(manager.xrOrigin.raySpaces.left.children),
    getOnlyMesh(manager.xrOrigin.raySpaces.right.children),
  ];
}

function getCursorMeshes(manager: XRInputManagerInstance): Mesh[] {
  return manager.xrOrigin.children.filter((child): child is Mesh => {
    return child instanceof Mesh;
  });
}

function getOnlyMesh(children: Array<unknown>): Mesh {
  const meshes = children.filter(
    (child): child is Mesh => child instanceof Mesh,
  );
  expect(meshes).toHaveLength(1);
  return meshes[0];
}

function createNoSessionXRManager(): WebXRManager {
  return {
    getSession: () => null,
    getReferenceSpace: () => null,
    getFrame: () => null,
  } as unknown as WebXRManager;
}

function createMockCanvas() {
  const context = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
  };

  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
  };
}
