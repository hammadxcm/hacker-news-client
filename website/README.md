# hacker-news-client website

Marketing & install-snippet landing site for [hacker-news-client](https://github.com/hammadxcm/hacker-news-client). Built with [Astro](https://astro.build), deployed to GitHub Pages.

## Develop

```bash
pnpm install
pnpm dev      # http://localhost:4321
```

## Scripts

| Command            | Description                                  |
| ------------------ | -------------------------------------------- |
| `pnpm dev`         | Start the local dev server                   |
| `pnpm build`       | Build the static site to `dist/`             |
| `pnpm preview`     | Serve the built site locally                 |
| `pnpm typecheck`   | Run `astro check` (TypeScript + .astro)      |
| `pnpm test`        | Run Vitest unit tests                        |
| `pnpm clean`       | Remove `dist/` and `.astro/` caches          |

## Deploy URL

The site currently serves at the default GitHub Pages project URL: <https://hammadxcm.github.io/hacker-news-client/>. The `base: '/hacker-news-client/'` in `astro.config.ts` matches the repo name.

### Switching to a custom domain later

1. Create `website/public/CNAME` with one line: the bare hostname (e.g. `hn.example.com`).
2. Update `astro.config.ts`:
   - `site: 'https://hn.example.com'` (your domain)
   - `base: '/'`
3. Configure DNS:
   - **Subdomain**: `CNAME` record pointing to `hammadxcm.github.io`.
   - **Apex**: four `A` records pointing to the [GitHub Pages IPs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site#configuring-an-apex-domain).
4. In repo Settings → Pages, set the custom domain (GitHub will verify the CNAME and provision HTTPS).

## First deploy

After pushing the new files, in the GitHub repo settings → Pages, set **Source = "GitHub Actions"** (one-time). The `Deploy Pages` workflow will run on every push to `main` that touches `website/**`.

## i18n

Twelve locales: `en` (default), `es`, `fr`, `de`, `pt`, `ru`, `zh`, `hi`, `ar`, `ur`, `bn`, `ja`. English is the canonical key set in `src/i18n/translations/en.ts`; other locales fall back to English for missing keys. Real translations are tracked separately — initial files seed English values to keep key parity.
