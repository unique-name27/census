# Census Ask relay

A Cloudflare Worker that holds the team's Claude API key, so anyone with the team passcode can use
Ask Census without a key of their own. The key never reaches the site, the repo or anyone's
browser. The full guide, with costs, security notes and how to change or turn it off, is
[docs/ASK-RELAY.md](../docs/ASK-RELAY.md).

## Set it up

You need Node.js 22 or later, a free Cloudflare account, and an API key created inside a "Census"
workspace (with a monthly spend limit) in the Claude Console. In this folder:

```sh
npm install                                  # Wrangler, for this folder only
npx wrangler login                           # allow Wrangler to use your Cloudflare account
npx wrangler secret put ANTHROPIC_API_KEY    # paste the key at this prompt only
npx wrangler secret put CENSUS_PASSCODE      # the team passcode, 4 characters or more
npx wrangler deploy                          # prints https://census-ask-relay.<subdomain>.workers.dev
```

Send the printed address to whoever looks after Census. They put it in `public/ask-relay.json` as
`{ "relayUrl": "https://…" }` (that field and nothing else: the file is public) and run
`npm run deploy`; Settings, Ask Census then asks for the team passcode.

## What it accepts

Only Ask Census's own requests: `POST /v1/messages` from the published Census address, with the
right passcode, the models, `max_tokens` and content Ask uses (no images, documents or files), and
a body of at most 2 MB, within a rate limit per address (an IPv6 address by its /64) and per
passcode. It sends on the body as it checked it, sets the key, passes on only `anthropic-version`
and `anthropic-beta`, and streams Anthropic's answer back with any copy of a secret hidden. It
never logs bodies, keys, passcodes or addresses. Only the deployed version answers
(`preview_urls = false`). The rules are in `src/handler.ts`; the settings in `wrangler.toml`.

Census's published address, `https://unique-name27.github.io`, is shared by every GitHub Pages site
of the account, and any of them can read what Census keeps in the browser. Give Census an address
of its own when you can, then allow only that one (docs/ASK-RELAY.md, Security notes).

## Files

| File | What it is |
|---|---|
| `src/handler.ts` | The request rules, as a pure function with its fetch and limits passed in |
| `src/limiter.ts` | The best-effort rate limit kept in the worker's memory |
| `src/index.ts` | The worker: the handler with the real fetch, limits and log |
| `wrangler.toml` | Name, settings (allowed addresses, models, limits), the optional rate limiting binding |
| `test/handler.test.ts` | Tests, run with Census's own suite (`npx vitest run` in the project folder) |

Secrets are only ever set with `npx wrangler secret put`. To try the relay on your computer, put a
separate test key (with a small spend limit) and a test passcode in a `.dev.vars` file in this
folder, never the team's, and run `npx wrangler dev --env local`, which also allows the dev
server's address. `.gitignore` keeps `.dev.vars` out of the repo, and the dev server never serves
it.
