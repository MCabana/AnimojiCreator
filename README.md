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