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
- `js/main.js` — app setup, character selection, drawing, and 3D model integration.
- `js/characters.js` — 2D character palettes and drawing functions.
- `js/camera.js` — camera access and MediaPipe face tracking.
- `js/recording.js` — canvas video recording.
- `js/fullscreen.js` — fullscreen viewport controls.
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