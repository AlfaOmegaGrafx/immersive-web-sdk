/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { forwardHtmlEvents } from '@pmndrs/pointer-events';
import { Types, createSystem } from '../ecs/index.js';

export class CanvasPointerSystem extends createSystem(
  {},
  {
    /** Forward DOM pointer events from the renderer canvas into the Three scene. */
    enabled: { type: Types.Boolean, default: true },
    /** Continue forwarding pointer events while an immersive XR session is active. */
    activeDuringXR: { type: Types.Boolean, default: false },
  },
) {
  private htmlHandler?: {
    destroy: () => void;
    update: () => void;
  };

  init(): void {
    this.cleanupFuncs.push(
      this.config.enabled.subscribe((enabled) => {
        this.htmlHandler?.destroy();
        this.htmlHandler = enabled
          ? forwardHtmlEvents(
              this.renderer.domElement,
              () => this.camera,
              this.scene,
            )
          : undefined;
      }),
    );
  }

  update(): void {
    if (!this.htmlHandler) {
      return;
    }
    if (this.world.session && !this.config.activeDuringXR.value) {
      return;
    }
    this.htmlHandler.update();
  }

  destroy(): void {
    super.destroy();
    this.htmlHandler?.destroy();
    this.htmlHandler = undefined;
  }
}
