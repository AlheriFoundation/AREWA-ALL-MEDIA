# Arewa All Media

Production-oriented starter for **Arewa All Media Downloader** — “One Link. All Your Media.”

## Current implementation

- Responsive, accessible vanilla HTML/CSS/JS frontend with original A/download-arrow branding.
- Informational About, Privacy, Terms, and Contact pages.
- Cloudflare Pages Functions endpoint at `POST /api/inspect`.
- Vercel-compatible adapters at `api/inspect.js` and `api/download.js`; the original Cloudflare Functions remain available for Pages deployments.
- Provider adapter table recognizes TikTok, Instagram, Facebook, YouTube, X, and Pinterest.
- Security headers, URL length limits, HTTPS/public-host validation, explicit host allowlist, no server-side fetching, and honest unavailable-integration responses.
- A small per-isolate request limiter (20 inspections/minute/IP) as defense in depth; configure Cloudflare WAF/Rate Limiting for durable distributed enforcement.
- Request bodies are capped at 4 KiB before JSON parsing; this is an application guard, not a replacement for an edge/WAF body-size rule.
- IPv4 and IPv6 loopback, private, link-local, reserved, documentation, multicast, and IPv4-mapped unsafe destinations are rejected. The current service performs no outbound fetches.
- Unit tests for URL recognition and unsafe input cases.

## Local development

Requires Node.js 20+.

```bash
npm install
npm test
npx wrangler pages dev .
```

The production build must use the verified domain you control. Replace `YOUR-VERIFIED-DOMAIN.example` in canonical tags, Open Graph URL, `robots.txt`, `sitemap.xml`, and `contact.html` before launch.

## Authorized provider setup

No provider API credential is included or required for the recognition-only starter. Before enabling downloads, obtain written authorization and API documentation from each provider. Add credentials only as Cloudflare secrets, never in frontend code or Git:

```bash
npx wrangler pages secret put PROVIDER_API_KEY --project-name arewa-all-media
```

Implement each provider as an adapter that validates the provider response, enforces timeouts, returns only permitted metadata/download URLs, and maps denied/private/expired responses to safe errors. Do not add scraping, credential collection, proxying arbitrary URLs, DRM bypass, or redirect-following fetches.

### Strict outbound-request policy

The inspection endpoint must never fetch a user-provided URL. A future provider adapter may call only a fixed, documented, provider-authorized API origin selected in source code; it must not derive an outbound destination from the submitted URL, follow unvalidated redirects, resolve private/link-local destinations, or proxy arbitrary response URLs. Each adapter must enforce HTTPS, an explicit allowlist, a short timeout, bounded response size, and provider-authorized signed download URLs.

## Vercel preview testing

The project can be deployed to a temporary Vercel URL without changing the source placeholders. Vercel automatically serves the static files and maps `api/inspect.js` and `api/download.js` to `/api/inspect` and `/api/download`. The adapters translate Vercel's Node request/response objects to the existing Fetch-based handlers.

`vercel.json` applies `X-Robots-Tag: noindex, nofollow, noarchive` to keep temporary previews out of search indexes. The canonical tags, Open Graph URLs, `robots.txt`, `sitemap.xml`, and contact email intentionally remain placeholders until the actual Vercel URL and contact identity are confirmed. Before any public production launch, replace those values and remove or revise the preview noindex policy.

## Cloudflare Pages deployment

1. Create a Pages project connected to this GitHub repository.
2. Use the repository root as the build output directory; there is no build step.
3. Deploy with `npx wrangler pages deploy . --project-name arewa-all-media` or use GitHub integration.
4. Add the verified custom domain in Cloudflare Pages, then update the placeholders in the SEO files.
5. Configure platform API secrets only after the provider approval and adapter tests exist.

## Pre-launch checklist

- Replace domain and contact placeholders.
- Have Privacy Policy and Terms reviewed for the operator’s jurisdiction.
- Configure rate limiting at Cloudflare/WAF level and keep request logs redacted.
- Add provider-specific integration tests using approved fixtures.
- Verify download links are signed, short-lived, provider-authorized, and not used as arbitrary redirects.
