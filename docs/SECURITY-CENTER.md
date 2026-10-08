# Security center (Developer page)

The user asked: "build a security center in dev too to control role access, for example". They
chose: changes take effect for everyone through a **policy file** that ships with the site. Edits
are a draft in the browser where they are made; **Publish** produces the file.

Built as part of the roles build (docs/ROLES-V2.md), on top of its policy tables: the Security
center edits overrides on those tables. It lives on the Developer page (`#dev`, new tab
`security`) and shows only in Developer mode.

## What it is, and what it is not

A fixed banner at the top, in plain words:

> Census runs in the browser with no sign-in. These rules decide what each role sees and can do in
> Census. Anyone can still switch roles, and data already on a computer can be read with the
> browser's own tools. Keep sensitive data off computers that should not have it.

The name "Security center" is the user's. The modes copy rule in docs/ROLES.md (modes are a view,
not security) still applies everywhere else; the banned-words test exempts this page and its help
article.

## What it controls

Per role (HR, CHRO, Compensation, Finance, Recruiter, Talent management, HR ops, HRBP business
unit, HRBP region, Manager; Developer always sees everything and cannot be edited):

| Area | Controls |
|---|---|
| Role | Offered in the Mode menu or not; home view |
| Views and sub-tabs | Shown or hidden (including each Special analyses analysis) |
| Figures and metrics | Hidden per role, found by id, title or metric |
| Data | Datasets the role reads; drill kinds; person card (full, limited, none) |
| Pay | None, ratios, totals, or per person behind the session switch |
| Ask | On or off; each data tool; the screen action tools; make_chart |
| Exports | Figure exports, whole-view exports, records exports, the monthly report |
| Pages and menus | Action center, Data room and its tabs, Settings sections, Tools, Help articles and tours |

Scope kinds stay fixed by the role (a Manager is always locked to an org, an HRBP to a business
unit or region, a Recruiter to their reqs). Only what is shown inside the scope is editable.

**Guard rails that cannot be overridden** (the editor refuses with the reason, and a policy file
that tries is rejected line by line):
- protected characteristics are never shown;
- employee relations items never name a person;
- survey answers are never shown per person; manager cuts keep their minimum;
- anonymity minimums can only be raised, never lowered;
- pay and immigration details per person only ever behind their session switches;
- the Security center, debug overlays and the Ask tools console stay Developer-only;
- a role can never see outside its scope.

## The editor

- **Matrix:** roles as columns, surfaces as rows, grouped by kind (views, tabs, figures, metrics,
  datasets, drills, pay, Ask, exports, pages), with search and a "Changed only" filter. Each cell
  shows the decision (shown, limited, hidden) and whether it is the default or an override. Click
  a cell to change it; a short reason is required ("Finance asked for the hiring plan").
- **Role page:** one role at a time, as a checklist by area, with "Reset this role to defaults".
- **Preview as role:** switches to that role (choosing a scope where needed) with a bar "Previewing
  Finance. Back to the Security center", so the effect can be checked in the real app.
- **Changes:** the draft against what is in force, and what is in force against the defaults, each
  as a readable list ("Finance: Recruiting shown (was hidden). Reason: ..."), with Undo per change
  and a change log (who typed their name, when, why).
- **In force:** which policy file is loaded (version, published by, date, notes, checksum), or
  "Built-in defaults" when none is.

## Publish and load

- **Publish** validates the draft, then downloads `access-policy.json`:
  `{ format: "census-access-policy", version, publishedAt, publishedBy, notes, overrides: [...],
  checksum }`, with each override `{ role, surface, decision, reason, by, at }`.
- The page shows the steps to put it in force: place the file at `public/access-policy.json` in the
  Census repository and redeploy (`npm run deploy`). Census then loads it for everyone.
- **At startup** Census fetches `access-policy.json` from its own site (same origin, no cache by
  version). A missing file means the built-in defaults. An invalid file, an unknown format version
  or a checksum mismatch is ignored as a whole, with a Developer-mode warning naming why; unknown
  roles or surfaces are skipped one by one and listed in the Security center.
- The one-file build (`census.html`, opened from disk) cannot fetch a file: it uses the policy file
  embedded at build time when one is present at `public/access-policy.json`, otherwise the
  defaults. The Security center says which.
- **Import** loads a policy file into the draft (to edit the one in force, or review someone
  else's) with a preview of changes before it applies.
- Drafts are kept in this browser (`census:access-draft`) and in the settings file; the policy in
  force is never changed by a draft.

## Tests

- Overrides change exactly the targeted decisions in the matrix snapshot; Developer is unaffected.
- Every guard rail: the editor refuses it, and a policy file that tries it has that line rejected
  while the rest applies.
- Loading: missing file, valid file, invalid JSON, wrong format version, checksum mismatch, unknown
  role, unknown surface, an override that conflicts with a scope; the one-file build's embedded
  policy.
- Publish round trip: draft, publish, load, the same decisions.
- Preview as role returns to the Security center with the draft intact.
- A route, figure, Ask tool or export hidden by an override is hidden everywhere it can be reached
  (the same red-team list as docs/ROLES-V2.md).
