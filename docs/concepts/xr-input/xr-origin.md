---
title: XR Origin & Spaces
---

# XR Origin & Spaces

`XROrigin` is the persistent local player origin. IWSDK creates it for every world, including browser-only worlds created with `xr: false`, and keeps `world.camera` parented under it. In XR, `XRInputManager` updates the head, ray, and grip spaces from the XR frame each tick. Outside XR, the origin is still useful as the coordinate space you can later hand to XR without rebuilding your scene graph.

For first-person browser movement, move `world.player` and leave `world.camera` as the viewer under that rig. For orbit, editor, product, cinematic, or third-person views, it is fine to keep `world.player` at the origin and drive `world.camera` locally. `world.camera.position` is local to `world.player`; call `world.camera.getWorldPosition(...)` when you need the viewer's world-space position.

## Spaces

- `head`: viewer pose (HMD). Parent head‑attached UI here.
- `raySpaces.left/right`: target‑ray spaces for pointing.
- `gripSpaces.left/right`: grip spaces for holding tools/objects.
- `secondaryRaySpaces.left/right`: additional spaces used when a non‑primary source is present.
- `secondaryGripSpaces.left/right`: likewise for grips.

Only `head`, primary `raySpaces`, and primary `gripSpaces` are added as children of the origin by default. Secondary spaces are updated but not parented for rendering since their visuals are hidden; you may parent or visualize them if needed.

## Lifecycle and updates

Each frame (`XRInputManager.update`):

1. For each detected `XRInputSource`, choose the appropriate target spaces (primary vs secondary) for that side.
2. Copy pose matrices from `XRFrame.getPose(...)` into the chosen `ray` and `grip` groups.
3. If the source lacks `gripSpace`, the adapter mirrors the ray transform into the grip.
4. Update the head from `getViewerPose`.
5. Call `xrOrigin.updateMatrixWorld(true)` before pointer updates.

## Using spaces in your app

Attach your own tools to the spaces to keep them aligned in XR.

```ts
// A laser sight attached to the right ray
const sight = new Mesh(new CylinderGeometry(0.001, 0.001, 0.2), mat);
world.input.xr.xrOrigin.raySpaces.right.add(sight);

// A held gadget anchored to the left grip
const gadget = new Object3D();
gadget.position.set(0, -0.02, 0.05);
world.input.xr.xrOrigin.gripSpaces.left.add(gadget);
```

Head‑locked UI:

```ts
const hud = createReticleOrHUD();
hud.position.set(0, 0, -0.6);
world.input.xr.xrOrigin.head.add(hud);
```

## Coordinate spaces and conversions

- `XROrigin` itself lives in world space and can be moved/rotated (e.g., for locomotion). Its children spaces receive poses relative to the XR reference space.
- To convert a world‑space point to origin‑local (for e.g., cursor placement), use Three.js helpers:

```ts
const pLocal = cursorWorld.clone();
world.input.xr.xrOrigin.worldToLocal(pLocal);
```

## Tips

- Keep long‑lived objects parented under the appropriate space to avoid per‑frame copying of transforms.
- If you show secondary sources in your app, consider adding `secondaryRaySpaces`/`secondaryGripSpaces` under the origin to make their transforms visible in the scene graph.
