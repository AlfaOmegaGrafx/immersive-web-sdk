/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  CapsuleGeometry,
  Mesh,
  MeshStandardMaterial,
  createSystem,
} from '@iwsdk/core';

const RADIANS_PER_PIXEL = 0.0025;
const PITCH_LIMIT = Math.PI / 2 - 0.01;
const RIGHT_BUTTON = 2;
const EYE_HEIGHT = 1.6;
const TPS_DISTANCE = 2.5;
const AVATAR_RADIUS = 0.3;
const AVATAR_LENGTH = 1.0;
const AVATAR_CENTER_Y = AVATAR_RADIUS + AVATAR_LENGTH / 2;

type ViewMode = 'fps' | 'tps';

export class BrowserMouseLookSystem extends createSystem({}) {
  private locked = false;
  private pitch = 0;
  private mode: ViewMode = 'fps';
  private avatar!: Mesh;

  init(): void {
    this.avatar = new Mesh(
      new CapsuleGeometry(AVATAR_RADIUS, AVATAR_LENGTH, 4, 12),
      new MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.6 }),
    );
    this.avatar.position.set(0, AVATAR_CENTER_Y, 0);
    this.avatar.visible = false;
    this.player.add(this.avatar);
    this.applyCameraPose();

    const canvas = this.renderer.domElement as HTMLCanvasElement;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== RIGHT_BUTTON) {
        return;
      }
      event.preventDefault();
      canvas.requestPointerLock();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.button !== RIGHT_BUTTON || !this.locked) {
        return;
      }
      document.exitPointerLock();
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const onPointerLockChange = () => {
      this.locked = document.pointerLockElement === canvas;
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!this.locked) {
        return;
      }
      this.player.rotateY(-event.movementX * RADIANS_PER_PIXEL);
      const nextPitch = this.pitch - event.movementY * RADIANS_PER_PIXEL;
      this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, nextPitch));
      this.applyCameraPose();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onMouseMove);

    this.cleanupFuncs.push(() => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
      this.avatar.removeFromParent();
    });
  }

  toggleMode(): void {
    this.mode = this.mode === 'fps' ? 'tps' : 'fps';
    this.avatar.visible = this.mode === 'tps';
    this.applyCameraPose();
  }

  private applyCameraPose(): void {
    if (this.mode === 'fps') {
      this.camera.position.set(0, EYE_HEIGHT, 0);
      this.camera.rotation.set(this.pitch, 0, 0);
    } else {
      const sin = Math.sin(this.pitch);
      const cos = Math.cos(this.pitch);
      this.camera.position.set(
        0,
        EYE_HEIGHT - TPS_DISTANCE * sin,
        TPS_DISTANCE * cos,
      );
      this.camera.rotation.set(this.pitch, 0, 0);
    }
  }
}
