# Physics visual explainers

Final address: **https://physics.nicholasbardy.com**.

Activated September 10, 2026, with HTTPS. The initial source is commit
`923d74ad9b38663cd71494decfbb2aa14b7322b7`, matching the existing published site.
Homepage, direct article URLs, JavaScript, and stylesheets were verified live.

Cloudflare Workers Static Assets hosts the browser application. Wrangler's
custom-domain configuration manages DNS and HTTPS in the existing
`nicholasbardy.com` zone. The WebGPU simulations run on the reader's device.
An HTTP-only Worker route redirects to HTTPS while preserving the article
path and query. HTTPS requests go straight to Static Assets.

Article source remains in the sibling `wave_physics_0to1` repository. This
directory owns the domain and deployment. Builds export a committed source
revision into a temporary directory, leaving ongoing article edits out of a
domain deployment. The source checkout must have its Bun dependencies installed.

## Deploy

From this directory, with Wrangler logged in to Nick's Cloudflare account:

```sh
# Build and deploy the source checkout's latest commit.
bunx wrangler@4.129.0 deploy --config wrangler.jsonc

# Or publish an exact source revision.
PHYSICS_SOURCE_REF=<commit> bunx wrangler@4.129.0 deploy --config wrangler.jsonc

# Only needed when provisioning or changing the HTTP-to-HTTPS redirect.
bunx wrangler@4.129.0 deploy --config wrangler-https.jsonc
```

`PHYSICS_SOURCE_REPO` optionally selects another source checkout. Its default
is the sibling `/git/wave_physics_0to1` directory relative to Namesake.
Commit approved article changes before deploying them. The live
`/build-info.json` records the deployed source commit.

The GitHub Pages deployment command in the article repository still updates
the old GitHub address. Use the command above to update the physics domain.

## Publishing and email

Nick confirmed `physics.nicholasbardy.com` on September 10, 2026. On September
11 he chose an owned Cloudflare Worker + D1 list for the visual explainers,
replacing the Substack signup handoff. `/subscribe` now leads to the homepage
signup box. The shared article template includes light-blue signup boxes at
the top and bottom, and links to `/rss.xml`.

The collection API is
`https://visual-explainers-newsletter.nicholasbardy.workers.dev`. Its Worker,
D1 migration, tests, and operating notes live in the article repository under
`workers/newsletter/` and `LAUNCH.md`. No existing Substack subscribers were
imported and no announcement was sent. The endpoint collects subscriptions;
email delivery and announcement campaigns remain separate work.

The broader Substack publication and proposed `blog.nicholasbardy.com` setup
are unaffected by the visual explainers’ newsletter choice.
