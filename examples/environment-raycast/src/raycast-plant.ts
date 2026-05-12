/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AssetManager,
  createSystem,
  Entity,
  EnvironmentRaycastTarget,
  Object3D,
  Quaternion,
  RaycastSpace,
  Vector3,
} from '@iwsdk/core';

/**
 * System that demonstrates environment raycasting with plants.
 *
 * - Creates a "preview" plant that follows the right controller's raycast hit point
 *   using the EnvironmentRaycastTarget component (continuous raycasting)
 * - On trigger press, spawns a permanent plant at the current hit location
 */
export class RaycastPlantSystem extends createSystem({
  raycastTargets: { required: [EnvironmentRaycastTarget] },
}) {
  private previewPlant: Object3D | null = null;
  private previewEntity: Entity | null = null;

  init() {
    // Create preview plant that follows raycast
    const plantGltf = AssetManager.getGLTF('plantSansevieria');
    if (!plantGltf) {
      console.warn('[RaycastPlantSystem] plantSansevieria asset not loaded');
      return;
    }

    this.previewPlant = plantGltf.scene.clone();
    this.scene.add(this.previewPlant);

    // Create an entity with EnvironmentRaycastTarget to track raycast hits
    this.previewEntity = this.world.createTransformEntity(this.previewPlant);
    this.previewEntity.addComponent(EnvironmentRaycastTarget, {
      space: RaycastSpace.Right,
      maxDistance: 10,
    });
  }

  update() {
    // Check for trigger press on right hand to spawn a plant
    const rightGamepad = this.input.gamepads.right;
    const triggerPressed = rightGamepad?.getSelectStart() ?? false;

    // Spawn on trigger press - use the current hit result from the preview entity
    if (triggerPressed && this.previewEntity && this.previewPlant) {
      const xrHitTestResult = this.previewEntity.getValue(
        EnvironmentRaycastTarget,
        'xrHitTestResult',
      ) as XRHitTestResult | undefined;

      if (xrHitTestResult && this.previewPlant.visible) {
        // Clone the current position and orientation from the preview plant
        const position = this.previewPlant.position.clone();
        const quaternion = this.previewPlant.quaternion.clone();
        this.spawnPlantAt(position, quaternion);
      }
    }
  }

  private spawnPlantAt(position: Vector3, quaternion: Quaternion) {
    const plantGltf = AssetManager.getGLTF('plantSansevieria');
    if (!plantGltf) {
      return;
    }

    const newPlant = plantGltf.scene.clone();
    newPlant.position.copy(position);
    newPlant.quaternion.copy(quaternion);

    this.scene.add(newPlant);

    // Create entity for the spawned plant (no raycast component - it's permanent)
    this.world.createTransformEntity(newPlant);
  }
}
