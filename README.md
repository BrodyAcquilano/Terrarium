# Terrarium

A heat study in a sealed terrarium: an air-only **Temperature** model, a
three-medium **Water Level** model, and **Specifications** — with notes on
particles, Boltzmann distributions, first-order (RC-like) heating, and the filter model of
temperature distributions.

Built with Vite + React.

## Run locally

```bash
npm install
npm run dev
```

Then open the local address Vite prints (usually http://localhost:5173).

## Build

```bash
npm run build
```

## Project layout

- `src/App.jsx` — mounts the page and loads its behaviour scripts once
- `src/markup.html` — the page markup (tabs, terrarium views, notes)
- `src/terrarium.css` — the page styles
- `public/terrarium-scripts.js` — the page's simulation and graph scripts
