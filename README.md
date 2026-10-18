# Animoji Creator

A browser-based 2D and 3D character animation app. It uses Babylon.js and MediaPipe from CDNs.

## Run locally

Serve the project directory over HTTP, then open `http://localhost:8000` in a browser. For example, from the project directory on Windows:

```powershell
py -m http.server 8000
```

Camera access requires `localhost` or HTTPS. Opening `index.html` directly with `file://` will not work because the app uses JavaScript modules.

## Project layout

- `index.html` — page structure, Babylon.js CDN scripts, and app entry point.
- `styles.css` — application and responsive layout styles.
- `js/main.js` — app setup, character selection, preview drawing, and feature coordination.
- `js/characters.js` — 2D character palettes and drawing functions.
- `js/camera.js` — camera access and MediaPipe face tracking.
- `js/recording.js` — canvas video recording.
- `js/fullscreen.js` — fullscreen viewport controls.
- `js/custom-character-editor.js` — custom 2D image upload, face masking, feature placement, and magnifier.
- `js/preview-background.js` — still/video backgrounds and solid color.
- `js/accessory-manager.js` — accessory catalog validation, character compatibility selectors, skeleton remapping, and accessory resource lifecycle.
- `models/core/` — core 3D character model.
- `models/characters.json` — 3D character IDs, button names and icons, and model paths.
- `models/attachments/hats/` and `models/attachments/shirts/` — selectable, rig-bound accessories.
- `models/accessories.json` — accessory names, slots, model paths, and compatible character IDs.

## Configure 3D characters

Edit `models/characters.json` to add or change 3D character buttons. Each character needs a unique `id`, button `name`, button `icon`, and `model` path relative to the project root. The model path is loaded directly when its button is selected. Keep character IDs in `models/accessories.json` in sync for accessory compatibility.

```json
{
  "characters": [
    {
      "id": "uncle",
      "name": "Uncle",
      "icon": "👨",
      "model": "models/core/uncle.glb"
    }
  ]
}
```

## Configure accessories

Edit `models/accessories.json` to add or change accessories. Each entry in `compatibleCharacters` must match an `id` in the top-level `characters` list and a character ID used by the app. Add an accessory entry with a unique `id`, display `name`, `slot`, `model` path, and `compatibleCharacters` array. The UI creates one selector per slot and only lists accessories compatible with the currently selected character.

```json
{
  "characters": [
    { "id": "standard", "name": "Standard" }
  ],
  "accessories": [
    {
      "id": "winter-hat",
      "name": "Winter Hat",
      "slot": "hat",
      "model": "models/attachments/hats/winterHat.glb",
      "compatibleCharacters": ["standard"]
    }
  ]
}
```

Standard and Uncle are available in the 3D character selection. Standard is currently the only 3D character configured for accessories. The 2D animals do not have 3D skeletons for accessories to attach to yet.

## Preview backgrounds

Use the **Background** controls in the studio panel to choose a solid color, still image, or video file. The solid color is used when no image or video is selected. Images are cropped to cover the character viewport; videos are muted and loop automatically. The selected background is composited behind both 2D and 3D characters and is included in canvas recordings. Use **Clear** to remove a selected image or video and return to the chosen solid color.