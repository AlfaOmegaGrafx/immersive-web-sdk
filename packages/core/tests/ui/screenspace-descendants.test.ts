/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Object3D, PerspectiveCamera, Scene } from '../../src/runtime/index.js';
import type { ScenePointerDescendants } from '../../src/runtime/scene-pointer-descendants.js';
import { ScreenSpaceUISystem } from '../../src/ui/screenspace.js';
import { PanelDocument } from '../../src/ui/ui.js';

vi.hoisted(() => {
  (globalThis as any).document = {
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
    createElement: () => ({
      appendChild: () => {},
      style: {},
    }),
  };
  (globalThis as any).window = {
    addEventListener: () => {},
    getComputedStyle: () => ({
      height: '0',
      left: '0',
      top: '0',
      width: '0',
    }),
  };
});

function createScreenSpaceSystem({
  camera,
  entity,
  isPresenting = false,
  scene,
}: {
  camera: PerspectiveCamera;
  entity: any;
  isPresenting?: boolean;
  scene: Scene;
}) {
  const renderer = {
    domElement: {
      clientHeight: 720,
      clientWidth: 1280,
    },
    xr: {
      isPresenting,
    },
  };
  const world = {
    camera,
    globals: {},
    input: {},
    player: new Object3D(),
    playerEntity: {},
    playerHeadEntity: {},
    renderer,
    scene,
    visibilityState: { value: 'non-immersive' },
  };
  const system = new ScreenSpaceUISystem(world as any, {} as any, 0);
  system.queries = {
    panels: {
      entities: new Set([entity]),
    },
  } as any;
  return { renderer, system };
}

function createDocument() {
  const document = new Object3D() as any;
  Object.defineProperty(document, 'computedSize', {
    get: () => null,
  });
  document.setTargetDimensions = () => {};
  return document as Object3D;
}

describe('ScreenSpaceUISystem screen-space descendants', () => {
  beforeEach(() => {
    // PanelDocument is an ECS component with flat per-entity storage; these
    // tests inject the loaded document directly to isolate ScreenSpaceUISystem.
    (PanelDocument.data as any).document = [];
  });

  it('publishes documents moved under the camera', () => {
    const scene = new Scene() as Scene & ScenePointerDescendants;
    const camera = new PerspectiveCamera();
    const entityObject = new Object3D();
    const document = createDocument();
    entityObject.add(document);

    const entity = {
      index: 0,
      object3D: entityObject,
    };
    (PanelDocument.data as any).document[entity.index] = document;

    const { system } = createScreenSpaceSystem({ camera, entity, scene });

    system.update();

    expect(document.parent).toBe(camera);
    expect(scene.screenSpaceDescendants).toEqual([document]);
  });

  it('clears screen-space descendants after returning documents to world space', () => {
    const scene = new Scene() as Scene & ScenePointerDescendants;
    const camera = new PerspectiveCamera();
    const entityObject = new Object3D();
    const document = createDocument();
    entityObject.add(document);

    const entity = {
      index: 0,
      object3D: entityObject,
    };
    (PanelDocument.data as any).document[entity.index] = document;

    const { renderer, system } = createScreenSpaceSystem({
      camera,
      entity,
      scene,
    });

    system.update();
    renderer.xr.isPresenting = true;
    system.update();

    expect(document.parent).toBe(entityObject);
    expect(scene.screenSpaceDescendants).toBeUndefined();
  });
});
