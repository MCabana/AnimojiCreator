# Animoji Creator

A browser-based 2D and 3D character animation app. It uses Three.js and MediaPipe from CDNs.

## Run locally

Serve the project directory over HTTP, then open `http://localhost:8000` in a browser. For example, from the project directory on Windows:

```powershell
py -m http.server 8000
```

Camera access requires `localhost` or HTTPS. Opening `index.html` directly with `file://` will not work because the app uses JavaScript modules.

## Project layout

- `index.html` — page structure, CDN import map, and app entry point.
- `styles.css` — application and responsive layout styles.
- `js/main.js` — app setup, character selection, preview drawing, and feature coordination.
- `js/characters.js` — 2D character palettes and drawing functions.
- `js/camera.js` — camera access and MediaPipe face tracking.
- `js/recording.js` — canvas video recording.
- `js/fullscreen.js` — fullscreen viewport controls.
- `js/custom-character-editor.js` — custom 2D image upload, face masking, feature placement, and magnifier.
- `js/preview-background.js` — still/video backgrounds, solid color, and optional media-matched 3D lighting.
- `js/accessory-manager.js` — accessory catalog validation, character compatibility selectors, skeleton remapping, and accessory resource lifecycle.
- `models/core/` — core 3D character model.
- `models/attachments/hats/` and `models/attachments/shirts/` — selectable, rig-bound accessories.
- `models/accessories.json` — accessory names, slots, model paths, and compatible character IDs.

## Configure accessories

Edit `models/accessories.json` to add or change accessories. Each entry in `compatibleCharacters` must match an `id` in the top-level `characters` list and a character ID used by the app. Add an accessory entry with a unique `id`, display `name`, `slot`, `model` path, and `compatibleCharacters` array. The UI creates one selector per slot and only lists accessories compatible with the currently selected character.

```json
{
  "characters": [
    { "id": "cowboy", "name": "Standard" }
  ],
  "accessories": [
    {
      "id": "winter-hat",
      "name": "Winter Hat",
      "slot": "hat",
      "model": "models/attachments/hats/winterHat.glb",
      "compatibleCharacters": ["cowboy"]
    }
  ]
}
```

`cowboy` (Standard) is currently the only rigged 3D character. The 2D animals do not have 3D skeletons for accessories to attach to yet.

## Preview backgrounds

Use the **Background** controls in the studio panel to choose a solid color, still image, or video file. The solid color is used when no image or video is selected. Images are cropped to cover the character viewport; videos are muted and loop automatically. The selected background is composited behind both 2D and 3D characters and is included in canvas recordings. In 3D mode, enable **Match 3D lighting to media** to tint the ambient and directional lights from the average color of an image or video; solid colors do not affect lighting, and video backgrounds are sampled twice per second. The toggle is enabled by default. Use **Clear** to remove a selected image or video and return to the chosen solid color.