# Katelyn McDevitt — About Me

A responsive personal website built with Vue 3, TypeScript, and Vite, featuring a blue and green palette, an introduction, filterable projects, and a LinkedIn contact link.

## Requirements

- Node.js 22.12 or newer
- npm (included with Node.js)

## Run locally

From the parent directory of this repository (or skip `cd intro` if you are already in it):

```sh
cd intro
npm install
npm run dev
```

Open the URL printed in the terminal, usually http://127.0.0.1:5173. Vite updates the page automatically when you save changes. If port 5173 is occupied, Vite selects another available port.

The server binds to `127.0.0.1`, so it is accessible only on your computer. Stop it with `Ctrl+C` in the terminal running the server.

This project is intended for local development. Do not publish or deploy it unless explicitly requested. The existing `.openai/hosting.json` identifies an earlier hosted copy; running the commands here does not publish anything.

## Project structure

```text
intro/
├── src/
│   ├── App.vue       # Page content, personal details, and project filtering
│   ├── main.ts       # Vue application entry point
│   └── style.css     # Colors, typography, artwork, and responsive layout
├── index.html        # Page title and description
├── vite.config.ts    # Vite configuration
├── tsconfig.json     # TypeScript configuration
└── package.json      # Dependencies and scripts
```

## Customize

- **Personal details:** Update the `profile` object in `src/App.vue` to change your name, introduction, LinkedIn URL, or email. Adding an email enables the email and copy-email actions in place of the LinkedIn contact link.
- **Content:** Edit the about section, projects array, and personal interests in `src/App.vue`. Projects and interests still include placeholder content.
- **Project filters:** Keep each project's `category` aligned with an entry in the `filters` array. The `All` filter shows every project.
- **Appearance:** Edit `src/style.css` to adjust the palette, spacing, fonts, and layouts.
- **Page metadata:** Update the title and description in `index.html`.

Fonts load from Google Fonts, with local fallback fonts when unavailable. The collage and project artwork are drawn with CSS.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server with automatic updates |
| `npm run build` | Check TypeScript and create a production build in `dist/` |
| `npm run preview` | Serve the production build locally, usually on port 4173 |

To check and preview the built site:

```sh
npm run build
npm run preview
```

Neither command deploys the site. Generated files in `dist/` and installed dependencies in `node_modules/` are ignored by Git.
