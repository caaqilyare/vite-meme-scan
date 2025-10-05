# Meme Scanner (Vite + React Native Web)

Powerful meme token scanner and paper-trading UI built with React, TypeScript, and Vite, optimized for web and mobile browsers. Includes per-token history, deposit log, trading panel, and one-click export-to-PDF.

- Author: **Munasar**
- Repository: https://github.com/caaqilyare/vite-meme-scan
- License: MIT (unless specified otherwise)

---

## 1) Run on Android with Termux (Top Recommendation)

Run everything locally on your phone: API server and web app.

Install Termux:
- F‑Droid: https://f-droid.org/en/packages/com.termux/
- Google Play: https://play.google.com/store/apps/details?id=com.termux (legacy; updates are primarily on F‑Droid)

Then in Termux:
1. Update base packages
   ```bash
   pkg update && pkg upgrade -y
   ```
2. Install required tools
   ```bash
   pkg install -y git nodejs-lts
   ```
3. Clone the repository
   ```bash
   git clone https://github.com/caaqilyare/vite-meme-scan.git
   cd vite-meme-scan
   ```
4. Install dependencies
   ```bash
   npm install
   ```
5. Development mode (two panes):
   - Pane A: Build server
     ```bash
     npm run build
     ```
   - Pane B: Start server
     ```bash
     npm run server
     ```
   - Open in your Android browser: `http://127.0.0.1:3001`

6. Production mode (single process serves API + built frontend):
   ```bash
   npm run build
   npm run server
   ```
   - Open: `http://127.0.0.1:3001` (the Express server also serves `dist/`).

Notes:
- If you need LAN access, run: `npm run dev -- --host 0.0.0.0` and browse `http://<phone-ip>:5173` from another device.
- If port 3001 is busy: `PORT=3002 npm run server` (then adjust URLs accordingly).
- Keep Termux awake for long sessions (use Termux:WakeLock add-on or keep screen on).

---

## 2) Quick Start (Desktop)

Requirements:
- Node.js 18+ (or 20+)

Steps:
1. Clone
   ```bash
   git clone https://github.com/caaqilyare/vite-meme-scan.git
   cd vite-meme-scan
   ```
2. Install deps
   ```bash
   npm install
   ```
3. Start mock API server (port 3001)
   ```bash
   npm run server
   ```
4. In a new terminal, start web app (Vite dev server)
   ```bash
   npm run dev
   ```
5. Open the printed URL (usually http://127.0.0.1:5173). The app proxies API calls to `http://127.0.0.1:3001` per `vite.config.ts`.

Build for production:
```bash
npm run build
npm run server
```
- Trading Panel: buy/sell simulation, live mini chart, capture to image.
- Export PDF: profile + deposits + full token history.

Server endpoints (dev): see `server/index.js`.
Client config: `vite.config.ts` maps `react-native` to `react-native-web` and proxies `/api`.

---

## 4) Environment
- Node 18+/20+
- Vite + React + TypeScript
- React Native Web for UI primitives

---

## 5) Troubleshooting
- Port already in use: stop the conflicting app or change ports.
- CORS errors when hitting external APIs (RugCheck/Fluxbeam): use HTTPS and ensure your browser/network allows the request.
- White screen on Android browser: try Chrome or Firefox; ensure both API server and Vite server are running in Termux.

---

## 6) Links
- Repo: https://github.com/caaqilyare/vite-meme-scan
- Termux on F‑Droid: https://f-droid.org/en/packages/com.termux/
- Termux on Google Play: https://play.google.com/store/apps/details?id=com.termux

---

## 7) Acknowledgements
- Author: **Munasar**
- Built with Vite, React, TypeScript, React Native Web.

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
