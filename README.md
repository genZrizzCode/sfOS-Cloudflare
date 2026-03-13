# sfOS Prototype

This project is a macOS-inspired web OS concept with a built-in proxy layer. The UI includes a dock, menu bar, draggable windows, and a Proxy Center that simulates system-wide routing.

## Open locally (static demo)

Open `index.html` directly in a browser, or run a local server:

`python3 -m http.server 5173`

Then visit `http://localhost:5173`.

## Deploy to Cloudflare Pages (with proxy)

sfOS can run on Cloudflare Pages so visitors don’t need to run any console commands.

### Structure

- Static files: `index.html`, `styles.css`, `app.js`, etc.
- Proxy function: `functions/proxy.js` (Cloudflare Pages Function).

The Nebula Tunnel window uses a relative endpoint: `/proxy?target=...`, which will be handled by `functions/proxy.js`.

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
- A new tab will open at `/proxy?target=...` on your Pages domain, streaming the real site via the Cloudflare Pages Function.

## Notes

- Proxy routing is simulated in `app.js` to keep the prototype self-contained.
- Update the endpoint, mode, and toggle in the Proxy Center to see changes reflected across the UI.
