# Ask Census for the whole team: the relay

The user asked: "I wanna save a Claude API key into the tool so anyone can query." Census is a public
site built from a public repo, so a key put in either is a key anyone can read and spend. Instead, a
small relay holds the key. It runs on Cloudflare under your own account; Census sends Ask's
requests to it with a **team passcode**, and the relay passes them on to Anthropic under the key.
Nobody's browser ever holds the key. (The passcode was chosen over single sign-on and over open
access.)

```
Census in a browser ──(question + team passcode)──> relay on Cloudflare ──(question + team key)──> Anthropic
                    <───────────── the answer streams back through the relay ─────────────────
```

The relay is in `ask-relay/` (a Cloudflare Worker: `src/handler.ts` holds the request rules,
`wrangler.toml` the settings). Its tests run with Census's own (`npx vitest run`).

## Set it up

Whoever looks after the team's Anthropic account does this once. It takes about 15 minutes.

1. **In the Claude Console** (console.anthropic.com):
   - Create a workspace named **Census** (Settings, Workspaces, Create workspace).
   - Give it a **monthly spend limit** (in the workspace's limits). This is the backstop: whatever
     happens, Anthropic stops at that amount for the month.
   - Create an **API key inside the Census workspace** (API keys, Create key, workspace Census).
     Name it "Census relay". Copy it once: you paste it in step 5, and nowhere else. Do not save it
     in a file, an email or a chat.
2. **Create a free Cloudflare account** at dash.cloudflare.com. The Free plan is enough.
3. **Open a terminal in the `ask-relay` folder** of the Census project. You need Node.js 22 or
   later. Run `npm install` there once: it installs Wrangler, Cloudflare's command line tool, for
   this folder only.
4. Run `npx wrangler login`. Your browser opens; allow Wrangler to use your Cloudflare account.
5. Run `npx wrangler secret put ANTHROPIC_API_KEY`. When it asks for the value, **paste the key at
   that prompt** and press Enter. If Wrangler says there is no Worker with that name yet and offers
   to create one, answer yes.
6. Run `npx wrangler secret put CENSUS_PASSCODE` and type the team passcode at the prompt. It must
   be at least 4 characters (letters, numbers, spaces and common symbols). A short one such as
   four digits works, but anyone who finds Census can guess it: the relay locks an address out
   after 10 wrong passcodes, and everyone after 50, for 15 minutes, and the workspace's spend limit
   is what protects your budget. Four or five random words joined with dashes is much safer. Do not
   reuse a password.
7. Run `npx wrangler deploy`. The first time, Wrangler may ask you to pick a workers.dev
   subdomain. It ends by printing the relay's address:
   `https://census-ask-relay.<your-subdomain>.workers.dev`.
8. Open that address in a browser. It should say the relay accepts only Ask Census requests: that
   means it is running.
9. **Send the lead the worker URL.** Only the URL: never the key. Give the passcode to the team
   through a private channel (in person, or your team's password manager).

### For the lead: turn it on in Census

1. Create `public/ask-relay.json` with the address and nothing else:

   ```json
   { "relayUrl": "https://census-ask-relay.<your-subdomain>.workers.dev" }
   ```

2. Run `npm run deploy`. The one-file build embeds the file and the deploy puts it beside
   `index.html` as `ask-relay.json`. The file is published for anyone to read, so the deploy
   refuses one with any field but `relayUrl` (a passcode, a key, a note) or anything that looks
   like an API key, and Census ignores such a file too. It also refuses an address Census would not
   use (not https, or more than the address), or a `census.html` built without the file.
3. Open the site, then Settings, Ask Census. It now shows **Team passcode**. Paste the passcode and
   choose **Check passcode**: it sends one tiny request through the relay.

The dev server (`npm run dev`, http://localhost:8820) reads the same file, but the deployed relay
accepts only the published site: to try Ask through a relay from the dev server, run one on your
computer (below). `census.html` opened from a file on your computer cannot use the relay (the
browser sends the address "null" for it, which the relay never allows, since sandboxed frames on
any site send it too); use the published site, or "Use my own key instead".

## What people see

- **Settings, Ask Census:** "Team passcode", kept for this tab unless "Keep on this device" is on,
  exactly like a key: never in the settings file, Report a problem, exports, logs or the page
  address. **Check passcode** and **Forget passcode**. **Use my own key instead** brings back the
  Claude API key and workspace ID fields, and Ask then goes straight to Anthropic as before.
- **On a shared address** (the published site at `unique-name27.github.io`, see Security notes),
  "Keep on this device" is offered for the passcode or a key with a warning: every site published
  at that address can read what is kept. Turn it on only where you trust them, such as a demo
  laptop.
- **No passcode yet:** the Ask panel says "Ask uses your team's passcode." and links to Settings.
- **Errors, in plain words:**

| Census says | Why | What to do |
|---|---|---|
| The team passcode was not accepted. | Wrong, old or missing passcode | Check it in Settings, or ask for the current one |
| Too many requests through the team relay. | Over the relay's limit a minute | Wait a minute |
| The team relay could not be reached. | No network, the relay is off, or the address is wrong | Try again; tell whoever runs the relay |
| The team relay is not set up yet. | A secret is missing, or the passcode is under 4 characters | Run step 5 or 6 again |
| The team relay does not accept requests from this address. | Census opened somewhere not in `ALLOWED_ORIGINS` | Use the usual address, or add it |
| The team relay does not offer this model. | The relay's model list is out of date | Pick another model, or update `ALLOWED_MODELS` |
| The team's API key was not accepted. | The key was deleted or disabled | Put in a new key (below) |
| The team has reached its spend limit for now. | The Census workspace hit its monthly limit | Wait for the reset, or raise the limit |
| The team's Anthropic account has no API credits left. | No prepaid credits | Add credits in the Console |

With no `ask-relay.json`, nothing changes: each person uses their own key, as before.

## Change the passcode

In `ask-relay`, run `npx wrangler secret put CENSUS_PASSCODE` and type the new one. It applies at
once (Wrangler deploys a new version). Everyone gets "The team passcode was not accepted." until
they put the new one in Settings. Change it when someone leaves the team, or if it may have been
shared further than the team. `wrangler.toml` turns version URLs off (`preview_urls = false`), so
only the deployed version answers and no older version can take the old passcode.

## Change the API key

1. In the Claude Console, create a new key in the Census workspace.
2. In `ask-relay`, run `npx wrangler secret put ANTHROPIC_API_KEY` and paste the new key.
3. Choose Check passcode in Census to confirm it works.
4. In the Console, delete the old key.

Do this at once if the key may have been seen by anyone.

## Turn the relay off

- **For a while:** set `workers_dev = false` in `ask-relay/wrangler.toml` and run
  `npx wrangler deploy`. The address stops answering; set it back to `true` and deploy to turn it
  on again.
- **For good:** run `npx wrangler delete` in `ask-relay` (the secrets go with it), and delete the
  key in the Claude Console.
- **In Census:** delete `public/ask-relay.json` and run `npm run deploy`. Ask goes back to each
  person's own key.
- **At once, from anywhere:** disable the key in the Claude Console. The relay then answers every
  question with "The team's API key was not accepted."

## What it costs

- **Cloudflare:** the Workers Free plan allows 100,000 requests a day (reset at midnight UTC) and
  10 ms of CPU time per request. Waiting for Anthropic does not count, and checking and writing
  out again even a 2 MB request takes about 5 ms. One question is one request per round of tools,
  at most 11, so the Free plan covers thousands of questions a day. Past 100,000 requests the relay
  stops answering until the next day (Cloudflare's error 1027).
- **Anyone who knows the relay's address can use up that daily quota.** The address is public (it
  is in `ask-relay.json` on the site and in the repo), and every request counts, even one the relay
  refuses for a wrong passcode or a rate limit, since the relay runs to refuse it. About 1.2
  requests a second all day is enough to turn Ask off until midnight UTC. One upside: the cap also
  limits anyone guessing the passcode to 100,000 tries a day. If the team relies on Ask, use the
  Workers Paid plan (no daily cap), or serve the relay from your own domain in Cloudflare with the
  WAF rate limiting rule under Security notes, which blocks a flood before the relay runs.
- **Anthropic:** billed per token to your account, from the Census workspace, up to its monthly
  spend limit. Prices per million tokens, input and output: Claude Opus 5.5 $4 and $20, Claude
  Sonnet 5.5 $2 and $10, Claude Haiku 4.5 $1 and $5 (Ask caches its prompt, which cuts the input
  cost of follow-up rounds). The Console's usage page shows what the Census workspace spent.
- **The worst case, to size the spend limit.** A usual Ask question costs cents, but anyone with
  the passcode can send requests of their own. The largest the relay passes on is 2 MB
  (`MAX_BODY_BYTES`), which can carry several hundred thousand to about a million input tokens
  (Claude Opus 5.5 reads up to 1 million; Claude Haiku 4.5, 200,000), plus 4,096 output tokens. On
  Claude Opus 5.5 that is up to about $4 a request; on Claude Sonnet 5.5, about $2; on Claude Haiku
  4.5, about $0.20. At the relay's limit of 60 requests a minute per passcode and address, counted
  in each running copy of the relay, one address could spend up to about $240 a minute on Claude
  Opus 5.5, and more from several addresses. Only the spend limit stops that: set it to what you
  can afford to lose in a bad month, and change the passcode at once if it may have leaked. To
  lower the worst case, lower `MAX_BODY_BYTES` (a long chat sends its whole history each time, so
  too low a cap ends long chats early), lower `REQUESTS_PER_MINUTE`, or take Claude Opus 5.5 out of
  `ALLOWED_MODELS`.

## Security notes

- **The key stays on Cloudflare.** It is a Wrangler secret: not in the site, the repo,
  `wrangler.toml` or anyone's browser. Anthropic's error messages do not repeat it, and the relay
  hides any copy of the key or passcode in an error before sending it back, as a second guard.
- **The passcode is the gate.** Anyone who has it can spend from the Census workspace, up to the
  rate limits and the spend limit. The allowed addresses (`ALLOWED_ORIGINS`) only keep other web
  pages from using the relay through someone's browser; a script can claim any address, so they
  are not a lock. Share the passcode only with the team, privately, and never put it in the repo,
  the site, a ticket or a shared channel. Change it when people leave or it may have leaked.
- **Census shares its web address with every other site on the account.** GitHub Pages serves all
  of an account's sites from one origin, `https://unique-name27.github.io` (17 sites when this was
  written), and
  the browser treats them as one site. Any page there can read what Census keeps in the browser: a
  passcode or key kept with "Keep on this device" (localStorage), and one kept for the tab
  (sessionStorage) when the same tab moves from Census to another of those sites. Every page there
  also passes the relay's address check. So a script bug or a compromised script on any of those
  sites (some load scripts from a CDN with no integrity check) could take the passcode and spend
  the team's key. Until Census has an address of its own, Census does not offer "Keep on this
  device" there (the passcode and any key are kept for this tab only), and you should treat the
  passcode as readable by those sites: keep the spend limit low, and change the passcode if one of
  them may have been compromised. **The fix is an address of Census's own**, then
  `ALLOWED_ORIGINS` set to that address alone:
  - a custom domain set on the census repository itself (Settings, Pages, Custom domain, such as
    `census.example.com`; a custom domain on the account's own `unique-name27.github.io` site would
    move every site to it, still sharing one address),
  - the site published from a separate GitHub account or organization that has no other Pages
    sites, or
  - the site published with Cloudflare Pages (its own `*.pages.dev` address).
- **The spend limit is the backstop.** Keep a monthly limit on the Census workspace that you are
  comfortable losing in a bad month.
- **Rate limits.** Each copy of the relay counts requests a minute per client address
  (`ADDRESS_REQUESTS_PER_MINUTE`, 120, counted before the passcode is checked, so guessing it is
  slow) and per passcode and address (`REQUESTS_PER_MINUTE`, 60). An IPv6 address is counted by
  its /64 network, since one home or server line usually holds a whole /64. Each copy keeps at
  most 10,000 counts; when it is full it lets go of the oldest counts still under their limit, never
  one over it, so a flood of new addresses cannot lift a block. Cloudflare runs many copies, so
  these slow a flood rather than count exactly, and Cloudflare advises against counting by
  address alone (people behind one network share one); before the passcode is checked, the address
  is all the relay has. Two ways to make them firmer:
  - Cloudflare's rate limiting binding: remove the `#` from the `[[ratelimits]]` lines in
    `wrangler.toml` and deploy. Its documentation does not say whether the Free plan includes it;
    if the deploy is refused, put the `#` back.
  - A WAF rate limiting rule, if you serve the relay from your own domain in Cloudflare (rules
    apply to a domain, not to workers.dev). The Free plan allows one rule, counted by IP over 10
    seconds: Security, WAF, Rate limiting rules; when URI Path equals `/v1/messages`; 20 requests
    per 10 seconds; same IP; Block for 10 seconds.
- **What it passes on.** Only `POST /v1/messages` with the fields Ask sends, the models Ask offers,
  `max_tokens` up to 4,096, Census's own tools (no web search or code execution, which cost
  extra), the content Ask sends (text, tool calls and results, thinking; no images, documents or
  files, so Anthropic never fetches anything from an address for it) and the one beta Ask uses.
  Everything else is refused before it reaches Anthropic. What goes on is the body as the relay
  checked it, written out again, so a request that names a field twice cannot slip a second value
  past the checks.
- **Logs.** Cloudflare keeps no request logs (`[observability] enabled = false`). The relay writes
  one line per request (what happened, the status, the model) that only `npx wrangler tail` shows
  while it runs: never a body, a key, a passcode or an address.
- **What comes back.** Any copy of the key or the passcode in Anthropic's answer is hidden as it
  streams through, and in an error, so are organization IDs. Anthropic does not repeat either
  secret; this is a second guard.
- **Privacy.** The relay sees what Anthropic sees: the tokenized questions and numbers. Names, IDs
  and pay amounts never leave the browser, with or without the relay. The relay keeps no copy.

## The relay's request rules

In the order it checks (`ask-relay/src/handler.ts`):

1. Only the path `/v1/messages`, with `?beta=true` or no query. Anything else: 404.
2. Only POST, and the CORS preflight before it. Any other method: 405.
3. Only the Census addresses in `ALLOWED_ORIGINS` (http and https origins only: "null", "*", file
   addresses and addresses with a path are dropped from the setting). Any other, or none: 403,
   with no CORS headers.
4. Only when both secrets are set and the passcode has at least 4 characters. Otherwise: 500,
   naming what is missing, never what a secret holds.
5. At most `ADDRESS_REQUESTS_PER_MINUTE` requests a minute from one client address (an IPv6
   address by its /64 network): 429.
6. The passcode in the `x-census-passcode` header, compared in constant time (both sides hashed
   first). Missing or wrong: 401.
7. At most `REQUESTS_PER_MINUTE` a minute per passcode and client address: 429.
8. `anthropic-version` as a date; `anthropic-beta` only from `ALLOWED_BETAS`: else 400.
9. A JSON body of at most `MAX_BODY_BYTES` (413), with only the fields Ask sends, a model from
   `ALLOWED_MODELS`, `max_tokens` from 1 to `MAX_TOKENS`, custom tools only, `tool_choice` auto or
   none, `output_config` effort only, `fallbacks` default only, and messages from the user or the
   assistant holding only text, tool calls, tool results (of text), thinking, redacted thinking and
   fallback markers: else 400.

Then the body the relay checked goes on, written out again from what it parsed (never the text as
it came), with `x-api-key` set from the secret. From the browser's headers only
`anthropic-version` and `anthropic-beta` go on: any key, authorization, workspace ID, cookie and
the passcode stay at the relay. The answer streams back as it comes, with any copy of the key or
the passcode hidden, CORS headers for the Census address, and only the response headers the SDK
reads (`content-type`, `request-id`, `retry-after`, `retry-after-ms`, `x-should-retry`). An error
also has organization IDs hidden. The relay's own refusals are shaped like Anthropic's errors, with
types that start `relay_`, and, except when Anthropic could not be reached, tell the SDK not to
retry.

## Settings (`ask-relay/wrangler.toml`)

| Setting | Default | What it does |
|---|---|---|
| `ALLOWED_ORIGINS` | `https://unique-name27.github.io` | Addresses Census runs at (http or https origins; never "null", "*" or a file) |
| `ALLOWED_MODELS` | `claude-opus-5-5,claude-sonnet-5-5,claude-haiku-4-5-20251001` | The models Ask offers |
| `ALLOWED_BETAS` | `server-side-fallback-2026-07-01` | The beta Ask sends |
| `MAX_TOKENS` | `4096` | Largest `max_tokens` |
| `MAX_BODY_BYTES` | `2000000` | Largest request |
| `REQUESTS_PER_MINUTE` | `60` | Per passcode and address |
| `ADDRESS_REQUESTS_PER_MINUTE` | `120` | Per address, right passcode or not |

`wrangler.toml` also sets `preview_urls = false` (only the deployed version answers) and, for the
relay run on your computer only, `[env.local.vars]` with the dev server's address. A test keeps the
models, betas, `max_tokens` and addresses in step with Census (`src/ask/engine/relay.test.ts`).
After changing a setting, run `npx wrangler deploy`.

## Try it on your computer (optional)

Never use the team's key for this. In the Claude Console, create a separate test key in a
workspace with a small spend limit (a few dollars), and make up a test passcode that is not the
team's.

1. In `ask-relay`, create `.dev.vars` (never committed) with two lines, `ANTHROPIC_API_KEY=` and
   `CENSUS_PASSCODE=`, each followed by the test value.
2. Run `npx wrangler dev --env local`. It serves the relay at http://localhost:8787 and, unlike the
   deployed relay, accepts the dev server's address (`[env.local.vars]` in `wrangler.toml`).
3. To point the dev server at it, set `relayUrl` in `public/ask-relay.json` to that address (Census
   accepts http only on this computer). The deploy refuses that file, so put the real address back,
   or remove the file, before you deploy.

The dev server never serves `.dev.vars` (it refuses `.dev.vars` and `.env` files, certificates and
`.git`; `scripts/devServer.mjs`), but any file you save in the project folder is one more copy of a
secret, which is why it should hold a test key only. When you are done, delete `.dev.vars` and the
test key.
