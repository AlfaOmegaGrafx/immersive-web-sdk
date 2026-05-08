---
outline: [2, 4]
---

# Chapter 13: Camera Access

The IWSDK provides a camera access system that enables XR applications to access device cameras for video streaming, photo capture, and computer vision tasks. This chapter covers implementing camera access in your WebXR applications.

## What You'll Build

By the end of this chapter, you'll be able to:

- Set up camera access with automatic device selection
- Display live camera feeds in your XR experience
- Capture video frames for photo capture or computer vision
- Handle camera permissions and device switching
- Configure camera resolution and frame rate

## Overview

The camera system leverages the browser's MediaDevices API to provide seamless camera access in XR sessions. The system automatically manages the camera lifecycle, starting streams when entering XR and stopping them when exiting.

### Key Components

- **`CameraSystem`** - Manages camera stream lifecycle
- **`CameraSource`** - Component holding camera configuration and output (texture, video element)
- **`CameraUtils`** - Static utilities for device enumeration, permissions, and frame capture
- **`CameraState`** - Enum for camera lifecycle states (Inactive, Starting, Active, Error)

## Quick Start

Here's a minimal example to get camera working in your XR scene:

```javascript
import { World, CameraSource, CameraUtils, SessionMode } from '@iwsdk/core';

// Optional: Request camera permission early for better UX
CameraUtils.getDevices()
  .then(() => console.log('Cameras ready'))
  .catch((error) => console.warn('Camera unavailable'));

World.create(document.getElementById('scene-container'), {
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
  },
  features: {
    camera: true, // Enable CameraSystem
  },
}).then((world) => {
  // Create camera entity
  const cameraEntity = world.createEntity();
  cameraEntity.addComponent(CameraSource, {
    facing: 'back',
    width: 1920,
    height: 1080,
    frameRate: 30,
  });

  // Store for later access
  world.globals.cameraEntity = cameraEntity;
});
```

## System Setup

### Step 1: Enable Camera Feature

```javascript
World.create(container, {
  features: {
    camera: true, // Registers CameraSystem and CameraSource
  },
});
```

### Step 2: Request Permissions Early (Optional)

```javascript
CameraUtils.getDevices()
  .then(() => {
    // Permission granted - camera will start quickly in XR
  })
  .catch((error) => {
    // Show UI warning that camera won't be available
  });
```

**Why request early?**

- Avoids permission prompt interrupting XR session
- Caches available cameras for instant access

### Step 3: Create Camera Entity

```javascript
const cameraEntity = world.createEntity();
cameraEntity.addComponent(CameraSource, {
  deviceId: '', // Empty = auto-select based on facing
  facing: 'back', // 'front' | 'back'
  width: 1920,
  height: 1080,
  frameRate: 30,
});
```

**Important**: The camera only activates when the XR session is visible.

## Understanding the Components

### CameraSource

Holds camera configuration (input) and output (texture, video element, stream).

#### Input Properties

- **`deviceId`** - Specific camera device ID (default: `''` for auto-selection)
- **`facing`** - Camera facing: `'front'` | `'back'` (default: `'back'`)
- **`width`** - Ideal video width in pixels (default: `1920`)
- **`height`** - Ideal video height in pixels (default: `1080`)
- **`frameRate`** - Ideal frame rate (default: `30`)

#### Output Properties (Read-only)

- **`state`** - Current state: `CameraState.Inactive | Starting | Active | Error`
- **`texture`** - `VideoTexture` for rendering (null until Active)
- **`videoElement`** - `HTMLVideoElement` for advanced access (null until Active)
- **`stream`** - `MediaStream` (internal, null until Active)

```javascript
// Get texture from CameraSource
const texture = cameraEntity.getValue(CameraSource, 'texture');
const state = cameraEntity.getValue(CameraSource, 'state');

// Check if ready
if (texture && state === CameraState.Active) {
  material.map = texture;
}
```

### CameraUtils

Static utility class for camera operations.

#### getDevices(refresh?: boolean)

```javascript
// Get cached devices (fast)
const devices = await CameraUtils.getDevices();

// Force re-enumeration (slow)
const devices = await CameraUtils.getDevices(true);

// Each device: { deviceId, label, facing: 'front' | 'back' | 'unknown' }
```

#### findByFacing(devices, facing)

```javascript
const devices = await CameraUtils.getDevices();
const backCamera = CameraUtils.findByFacing(devices, 'back');
```

#### hasPermission()

```javascript
const granted = await CameraUtils.hasPermission();
```

#### captureFrame(entity)

```javascript
const canvas = CameraUtils.captureFrame(cameraEntity);

if (canvas) {
  // Canvas at full video resolution
  const texture = new CanvasTexture(canvas);

  // Or export as image
  canvas.toBlob(
    (blob) => {
      const url = URL.createObjectURL(blob);
      // Download or upload
    },
    'image/jpeg',
    0.95,
  );
}
```

### CameraSystem

Automatically manages camera lifecycle:

- Starts cameras when XR visible
- Stops cameras when XR hidden
- Retries failed cameras
- Cleans up resources

**You don't need to interact with the system directly.**

## Camera Configuration

### Auto-Selection by Facing

```javascript
cameraEntity.addComponent(CameraSource, {
  facing: 'back', // System picks best matching camera
});
```

### Manual Device Selection

```javascript
const devices = await CameraUtils.getDevices();
cameraEntity.addComponent(CameraSource, {
  deviceId: devices[0].deviceId,
});
```

### Resolution and Frame Rate

```javascript
cameraEntity.addComponent(CameraSource, {
  facing: 'back',
  width: 1920, // Ideal (may be adjusted by browser)
  height: 1080,
  frameRate: 30,
});
```

### Switching Cameras

```javascript
cameraEntity.setValue(CameraSource, 'facing', 'front');
cameraEntity.setValue(CameraSource, 'deviceId', '');
cameraEntity.setValue(CameraSource, 'state', CameraState.Inactive); // Restart
```

## Common Patterns

### AR Camera Viewfinder

```javascript
class ViewfinderSystem extends createSystem({}) {
  private viewfinderPlane: Mesh | null = null;

  update() {
    if (!this.viewfinderPlane) this.createViewfinder();
  }

  private createViewfinder() {
    const cameraEntity = this.globals.cameraEntity;
    if (!cameraEntity) return;

    const texture = cameraEntity.getValue(CameraSource, 'texture');
    const videoElement = cameraEntity.getValue(CameraSource, 'videoElement');

    if (!texture || !videoElement) return; // Not ready

    // Calculate aspect ratio
    const aspectRatio = videoElement.videoWidth / videoElement.videoHeight;
    const width = 0.24;
    const height = width / aspectRatio;

    // Create plane with camera texture
    const geometry = new PlaneGeometry(width, height);
    const material = new MeshBasicMaterial({ map: texture });

    this.viewfinderPlane = new Mesh(geometry, material);
    this.viewfinderPlane.position.set(0, 0, -0.4);
    this.player.head.add(this.viewfinderPlane);
  }
}
```

### Photo Capture

```javascript
class PhotoCaptureSystem extends createSystem({}) {
  update() {
    if (this.input.xr.gamepads.right?.getSelectEnd()) {
      this.capturePhoto();
    }
  }

  private capturePhoto() {
    const canvas = CameraUtils.captureFrame(this.globals.cameraEntity);
    if (!canvas) return;

    // Create texture
    const texture = new CanvasTexture(canvas);
    texture.minFilter = LinearFilter;

    // Save photo
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `photo-${Date.now()}.jpg`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    }, 'image/jpeg', 0.95);
  }
}
```

### Digital Zoom

```javascript
private capturePhotoWithZoom(zoomLevel: number) {
  const canvas = CameraUtils.captureFrame(this.globals.cameraEntity);
  if (!canvas || zoomLevel === 1.0) return canvas;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Create temp canvas with original
  const temp = document.createElement('canvas');
  temp.width = canvas.width;
  temp.height = canvas.height;
  temp.getContext('2d')?.drawImage(canvas, 0, 0);

  // Calculate crop for zoom
  const sourceWidth = temp.width / zoomLevel;
  const sourceHeight = temp.height / zoomLevel;
  const sourceX = (temp.width - sourceWidth) / 2;
  const sourceY = (temp.height - sourceHeight) / 2;

  // Draw zoomed region
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
    temp,
    sourceX, sourceY, sourceWidth, sourceHeight,
    0, 0, canvas.width, canvas.height,
  );

  return canvas;
}
```

### Device Switching UI

```javascript
class CameraSwitcherSystem extends createSystem({}) {
  private availableCameras: CameraDeviceInfo[] = [];
  private currentIndex = 0;

  async init() {
    this.availableCameras = await CameraUtils.getDevices();
  }

  update() {
    if (this.input.xr.gamepads.right?.getButtonDown(0)) {
      this.switchCamera();
    }
  }

  private switchCamera() {
    if (this.availableCameras.length === 0) return;

    this.currentIndex = (this.currentIndex + 1) % this.availableCameras.length;
    const next = this.availableCameras[this.currentIndex];

    const cameraEntity = this.globals.cameraEntity;
    cameraEntity.setValue(CameraSource, 'deviceId', next.deviceId);
    cameraEntity.setValue(CameraSource, 'state', CameraState.Inactive);
  }
}
```

## Troubleshooting

### Common Issues

**Camera not starting:**

- Verify `features: { camera: true }` is set
- Check camera permissions granted
- Ensure XR session is active
- Check console for errors

**Black screen:**

- Check `state === CameraState.Active`
- Verify texture is not null
- Check `videoElement.videoWidth > 0`

**Permission denied:**

- Request early with `CameraUtils.getDevices()`
- Provide UI fallback

**Wrong camera:**

- Verify `facing` value
- Manually specify `deviceId`

**Poor quality:**

- Increase `width` and `height`
- Check actual resolution: `videoElement.videoWidth/videoHeight`

### Debug Tips

```javascript
// Log camera state
const state = cameraEntity.getValue(CameraSource, 'state');
const deviceId = cameraEntity.getValue(CameraSource, 'deviceId');
console.log({ state, deviceId });

// Check devices
const devices = await CameraUtils.getDevices();
console.log('Available cameras:', devices);

// Monitor video
const video = cameraEntity.getValue(CameraSource, 'videoElement');
console.log({
  width: video.videoWidth,
  height: video.videoHeight,
  readyState: video.readyState,
});
```

## Performance Considerations

1. **Resolution** - Use 1280x720 for balanced quality/performance
2. **Frame rate** - 30 FPS is sufficient for most use cases
3. **Cleanup** - Stop cameras when not needed
4. **Updates** - VideoTexture updates automatically each frame

## Best Practices

1. Request permissions early with `CameraUtils.getDevices()`
2. Check `state === CameraState.Active` before using texture
3. Handle failures gracefully with UI feedback
4. Stop camera when not actively used
5. Test on target devices (capabilities vary)
6. Use appropriate resolution for your needs

## Example Projects

Check out the complete implementation in the SDK:

- **`examples/cami`** - Full AR camera app with viewfinder, photo capture, zoom, and gallery

```bash
cd examples/cami
pnpm install
pnpm dev
```
