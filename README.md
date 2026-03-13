# <span style="font-family: 'SF Pro Display', sans-serif;">sfOS</span>

This project is a macOS-inspired web OS concept with a built-in deoxy layer. The UI includes a dock, menu bar, draggable windows, and a Deoxy Center that simulates system-wide routing.

## Open locally (static demo)

Open `index.html` directly in a browser for the UI demo only (deoxy tunneling requires a server), or run a local server:

`python3 -m http.server 5173`

Then visit `http://localhost:5173`.

## Deploy to Cloudflare Pages (with deoxy)

sfOS can run on Cloudflare Pages so visitors don’t need to run any console commands.

### Structure

- Static files: `index.html`, `styles.css`, `app.js`, etc.
- Deoxy function: `functions/deoxy.js` (Cloudflare Pages Function).

The Nebula Tunnel window uses a relative endpoint: `/deoxy?target=...`, which will be handled by `functions/deoxy.js`.

### Basic deployment steps

1. Push this project to a Git repository (GitHub, GitLab, etc.).
2. In Cloudflare Pages, create a new project from that repo.
3. Build settings:
   - **Framework preset**: None
   - **Build command**: leave empty (or `npm run build` if you add one later)
   - **Build output directory**: the folder containing `index.html` (for this prototype, the repo root that has `index.html` and the `functions/` directory).
4. Deploy.

Once deployed:

- Visit your `*.pages.dev` URL (or custom domain).
- Open **Nebula Tunnel** inside sfOS, enter a site (e.g. `example.com`), and click **Tunnel**.
- A new tab will open at `/deoxy?target=...` on your Pages domain, streaming the real site via the Cloudflare Pages Function.

## Notes

- The UI and tunnel status are simulated in `app.js`, but real deoxy proxying runs via `functions/deoxy.js` (Cloudflare Pages) or `server.js` locally.
- Update the endpoint, mode, and toggle in the Deoxy Center to see changes reflected across the UI.
- Menu bar time shows seconds and syncs to WorldTimeAPI every 10 minutes with device-time fallback.
- Menu bar battery uses the browser Battery API when available.
- Menu bar network shows Online/Offline based on browser connection events.
- Window content scrolls automatically when the window height is too small to fit the sub-app content.
