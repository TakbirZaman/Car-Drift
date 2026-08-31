# Apex Drift

A top-down arcade racer built with React + Canvas + Vite.

## Run it locally

You need [Node.js](https://nodejs.org) 18+ installed. Then, in this folder:

```bash
npm install
npm run dev
```

Open the URL it prints (usually **http://localhost:5173**). That was the
error you hit before — nothing was running on that port yet because the
dev server needs `npm install` + `npm run dev` first.

## Controls

- Accelerate: `W` or `↑`
- Brake/Reverse: `S` or `↓`
- Steer: `A`/`D` or `←`/`→`
- Multiplayer: Player 1 = WASD, Player 2 = Arrow keys

Progress (cars, coins, dollars, garage upgrades) is saved to your
browser's `localStorage`, so it persists between visits on the same
browser/device.

## Build for production

```bash
npm run build
```

Output goes to `dist/`. Preview it locally with:

```bash
npm run preview
```

## Deploy it for free

Any static host works since this builds to plain HTML/JS/CSS. Easiest options:

**Vercel**
```bash
npm i -g vercel
vercel
```

**Netlify**
```bash
npm i -g netlify-cli
netlify deploy --dir=dist --prod
```
(run `npm run build` first)

**GitHub Pages**
1. Push this folder to a GitHub repo.
2. In `vite.config.js`, add `base: '/your-repo-name/'`.
3. `npm run build`, then deploy the `dist/` folder using the
   `gh-pages` package or GitHub's Pages settings (deploy from `dist`).

## Notes

- Styling uses the Tailwind CDN script in `index.html` for a
  zero-config setup — no build step for CSS needed.
- Car names (Furia V12, Toro Rampante, etc.) are original names
  inspired by real supercar styles, since real brand names/logos are
  trademarked and can't be reproduced.
