# FacetDeck Plugin Vite Sample

Runnable sample project (not just two loose files) for developing a FacetDeck plugin with a common frontend toolchain.

## Project structure

```text
facetdeck-plugin-vite-sample/
  package.json
  vite.config.js
  index.html
  public/
    manifest.json
  src/
    main.js
```

## Local dev

```bash
npm install
npm run dev
```

Important:

- This starts only the plugin frontend sample project.
- It does **not** start the full FacetDeck SaaS stack.
- Use this mode to iterate plugin UI/logic quickly, then publish the built `manifest.json` + `index.html` to FacetDeck Community.

## Build

```bash
npm run build
```

After build:

- Upload `public/manifest.json` as plugin manifest.
- Upload `dist/index.html` as plugin entry html.

## What this sample demonstrates

- Read active slide html (`editor.getActiveSlideHtml`)
- Generate image (`ai.image.generate`)
- Insert image into slide (`resources.addImageToSlide`)
- Friendly error mapping for permission/rate/credits/quota failures
