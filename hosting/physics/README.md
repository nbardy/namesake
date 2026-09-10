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

The July Namesake discussion chose Substack for writing, distribution, and one
shared email list, with the visual explainers hosted separately. Nick confirmed
`physics.nicholasbardy.com` on September 10, 2026.

The Substack publication recorded in `meta_project/projects/substack.md` is
`commemorovindico385902.substack.com`. Its `/subscribe` page was verified live as
“Subscribe to Nicholas Bardy”. **https://physics.nicholasbardy.com/subscribe**
redirects to that signup page, using the same Substack list. Adding a visible
signup link/form to article layouts and testing the subscription lifecycle
remain pending. `blog.nicholasbardy.com` is
intended for Substack; its custom-domain or redirect setup is still pending.

No domain purchase or separate newsletter provider is needed for this setup.
