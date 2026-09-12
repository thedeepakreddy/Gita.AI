# Gita Counsel

A multilingual study companion grounded in the Bhagavad Gita, for moments when a
decision has stopped moving — the state Arjuna is in at the opening of the second
chapter.

Intended for eventual donation to ISKCON Budapest.

---

## The two rules this project is built around

**1. The application explains Krishna's teaching in the third person. It never
speaks as Krishna, or as God.**

"Krishna's counsel in 2.47 speaks to this" is correct. A first-person line
presented as divine speech is not — including one that merely drops the name.
This is enforced in three places, and all three should stay:

- the system prompt in [`src/lib/chat/prompt.ts`](src/lib/chat/prompt.ts),
- `looksLikeDivineFirstPerson()` in the same file, a post-check on every reply,
- the chat route, which **discards** an offending reply rather than rewriting it
  ([`src/app/api/chat/route.ts`](src/app/api/chat/route.ts)).

Rewriting a theological error into something that merely looks correct would be
worse than showing nothing, so the route saves nothing and asks the user to
rephrase.

**2. The trial is metered per account, and its budget is bounded twice.**

A new user gets `TRIAL_MESSAGE_LIMIT` messages (default 10) on the operator's
own key, then must supply their own. Because that trial spends real quota, two
independent limits apply and **both** are load-bearing:

- **per account** — spent once, never refilled;
- **globally per day** — `TRIAL_DAILY_CAP`, because anyone with a Google
  account can create another account, so the per-account limit alone bounds
  nothing.

The cheapest safe setup is a **free-tier Gemini key** as `TRIAL_API_KEY`: the
trial then costs nothing and the provider's own rate limits act as a third
backstop. Keep `TRIAL_DAILY_CAP` *below* the provider's free daily quota so
your cap trips first with a clear message, instead of the provider returning a
429 mid-conversation.

Set `TRIAL_API_KEY=""` to switch the trial off entirely; the app reverts to
pure bring-your-own-key with no code change.

Quota logic lives in
[`src/lib/chat/keyResolution.ts`](src/lib/chat/keyResolution.ts), deliberately
apart from authentication.

---

## Getting it running

```bash
npm install
cp .env.example .env      # then fill in the values below
npx prisma migrate dev
```

Generate the two secrets:

```bash
openssl rand -base64 32   # APP_ENCRYPTION_KEY
openssl rand -base64 32   # NEXTAUTH_SECRET
```

Google OAuth credentials come from the
[Google Cloud console](https://console.cloud.google.com/apis/credentials).
Authorised redirect URI: `http://localhost:3000/api/auth/callback/google`.
Until these are set the app still runs — you can browse `/study`; sign-in and
`/chat` are unavailable.

Build the vector index, then run the app — two commands, one process:

```bash
npm run embed:index          # builds data/embeddings/vectors.json (~30s)
npm run dev                  # Next.js on :3000
```

The encoder runs **inside** the Next.js process. There is no sidecar to start
and no Python needed to run this application; the model weights (~1.1GB)
download once into `.hf-cache/` on first use.

Python is still supported as an escape hatch — `EMBED_BACKEND=service` plus
`npm run embed:serve` — for a host where the native `onnxruntime` binding will
not install. It produces the identical vector space; see **Embedding model**.

---

## Layout

| Path | What it is |
|---|---|
| `data/verses/<scripture>/chapter-NN.json` | The corpus. Generic schema — see below. |
| `data/embeddings/vectors.json` | Generated vector store. Gitignored; rebuild it. |
| `scripts/build-chapter.mjs` | Fetches and merges the corpus from public sources. |
| `scripts/index-verses.ts` | Builds the vector index, in-process. |
| `scripts/verify-embedding-parity.ts` | Proves the index and the app agree. |
| `scripts/export-revisions.mjs` | Folds approved translations back into the JSON. |
| `scripts/embed.py` | The Python alternative: indexer **and** query service. |
| `src/lib/verses/` | Schema types, corpus reader, and the review overlay. |
| `src/lib/retrieval/` | Query embedding + top-k cosine search. |
| `src/lib/chat/` | Prompt construction and the BYOK provider adapters. |
| `src/lib/access/roles.ts` | Who may review translations, and who may not. |
| `src/lib/crypto/secrets.ts` | AES-256-GCM envelope encryption for user keys. |
| `src/app/[locale]/admin/` | Review queue, voice-guard log, operator dashboard. |
| `messages/<locale>.json` | UI strings. |

### Adding a language

1. Add the code to `locales` and `localeMeta` in `src/i18n/locales.ts`
2. Add `messages/<code>.json`
3. Add the `<code>` key to `translations` in the chapter JSON files
4. Re-run `npm run embed:index`

Nothing else hardcodes a locale list.

### The verse schema

Field names are deliberately scripture-agnostic so the same shape can carry
other texts later: `scripture`, `chapter`, `verse`, `sanskrit`,
`transliteration`, `word_meanings[]`, `translations{locale}`, plus
`translation_meta{locale}` carrying translator, source and licence.

`sanskrit` is the one field still naming a specific language. It was kept
because it is unambiguous for the corpus that actually exists today; the
generic descriptors (`sourceLanguage`, `script`) live on the chapter. **If a
non-Sanskrit scripture is added, this is the single field to rename.**

---

## Where the text comes from

| Part | Source | Licence |
|---|---|---|
| Devanagari + IAST | vedicscriptures.github.io | The Sanskrit text is ancient; not under copyright |
| English | Annie Besant, *Bhagavad-Gita*, 4th ed. (1922), via English Wikisource | Public domain — published pre-1929 (US) and Besant died 1933, so life+70 expired in 2003 (EU/Hungary) |

**Deliberately not Prabhupada / BBT.** That translation is in copyright and
would need separate written permission from the Bhaktivedanta Book Trust. Do
not paste it in as a convenience.

This is now enforced rather than requested. The Sanskrit API this builder calls
for the Devanagari **also serves `prabhu.et`** — the BBT translation — one
property access from the code that fetches the verse. `FORBIDDEN_TRANSLATION_FIELDS`
in [`scripts/build-chapter.mjs`](scripts/build-chapter.mjs) names it and five
other in-copyright translations and fails the build loudly if any is ingested.
If the temple obtains permission, lift the ban there deliberately and record the
permission reference in `translation_meta.license`.

Every translation carries `status: "placeholder"` and is surfaced in the UI as
*"Placeholder translation, pending review"*. These are stand-ins until a
reviewed translation is approved — they are not an authorised edition.

### The artwork

All seven backgrounds are CC0 folios from Cleveland Museum of Art and The Met —
Razmnama and Harivamsa pages, a Kurukshetra battle scene, Bhagavata Purana
leaves. CC0 asks for no attribution, but **both museums request it**, and the
full credit line for each is in
[`src/lib/ui/backgrounds.ts`](src/lib/ui/backgrounds.ts) ready to surface if you
want a visible credit.

### Verse numbering

701 verses across 18 chapters. The traditional count is usually given as 700;
the difference is chapter 13, which some recensions number 1–34 and others
1–35. This corpus follows the Sanskrit source's numbering. Worth confirming
against whichever edition ISKCON Budapest considers authoritative before
publishing.

### Two data hazards the builder guards against

Sanskrit and English come from **independent sources**, so a numbering
disagreement would silently pair verse N's Sanskrit with verse N+1's English —
plausible-looking and completely wrong. Two guards prevent it:

1. English is keyed off the **Devanagari verse terminator** (`॥ १४ ॥`), not the
   printed `(14)` markers. The 1922 scan mislabels and drops those markers —
   Discourse 18 marks verse 14's English as `(15)` and omits verse 32's
   entirely, so marker-based numbering shifts everything after it.
2. The parsed count is checked against the Sanskrit source's own
   `verses_count`, and the build **fails loudly** on mismatch rather than
   writing a misaligned chapter.

If you re-point the builder at a different edition, keep both guards.

### A third hazard, found the hard way

Both guards above check that the verses **line up**. Neither checks that a
verse contains only its own text — and English accumulates against the last
Devanagari terminator seen, so everything printed after a discourse's closing
verse landed *inside* that verse: the colophon, and in some chapters the whole
footnote apparatus.

It passed every check. The count was right, every verse had text, nothing
errored. The last verse of **17 of 18 chapters** simply carried up to 2,900
characters of 1922 editorial matter — displayed on `/study`, and embedded into
the vector index along with it.

`stripApparatus()` in the builder now cuts at the colophon, which Besant opens
identically every time. Existing files are cleaned without re-fetching 701
verses over two rate-limited APIs:

```bash
node scripts/build-chapter.mjs --repair --dry-run   # see what would change
node scripts/build-chapter.mjs --repair
npm run embed:index
```

The lesson generalises past this edition: **a corpus guard that only checks
alignment will pass text that is correctly numbered and wrong.** If you point
the builder somewhere new, look at the last verse of a chapter with your own
eyes before trusting the count.

---

## Handing it over

Three things exist so the application can stop being one person's project.

### 1. Translation review — `/admin/review`

Every one of the 701 English translations ships as `status: "placeholder"`.
Reviewers replace them **verse by verse**, in any of the three languages, with
the Sanskrit and the English reference visible while they work.

Revisions are stored in the database and layered over `data/verses/**.json` at
read time; the shipped files are never edited. Two reasons: a deployed app may
have no writable filesystem, and reverting a bad edit should be a `DELETE`
rather than a restore from backup — which matters when the text is scripture
and the reviewer is a volunteer learning the tool.

Approved text reaches everything at once — `/study`, search, and the verses the
counsel is grounded in — because every corpus getter applies the overlay.

**Saving and approving are separate.** `reviewed` records a name and a
timestamp against the text; that attribution should mean somebody stood behind
it, not that somebody typed in the box.

To hand the corpus on as plain files:

```bash
npm run data:export      # approved revisions -> data/verses/**.json
npm run embed:index      # or retrieval keeps matching the old wording
```

### 2. The voice-guard log — `/admin/violations`

The first rule of this project is that the application never speaks as Krishna.
The guard that enforces it used to fire silently: the reply was discarded and
nothing recorded it.

It is now written to `VoiceViolation` — which rule matched, the exact span, the
question, and the refused reply. None of it is shown to the person who asked.

This is not error tracking. It is the answer to the question a temple will
reasonably ask — *how often does your machine put words in Krishna's mouth?* —
stated as a rate per thousand replies, with the transcripts behind it. You
cannot answer that with an assurance; you answer it with a log.

Reading it is also the only way to tell a genuine drift from a pattern in
`DIVINE_FIRST_PERSON` that is too broad. Those need opposite responses.

### 3. Hungarian — a draft in review, not a shipped translation

`npm run data:hungarian` imports **Schmidt József's** Hungarian Gítá into the
review queue. Schmidt (1868–1933) translated it **directly from the Sanskrit**;
he died in 1933, so under Hungarian law (life + 70) the work has been public
domain since 1 January 2004.

The *transcription* is another matter. It lives in a contributor's draft sandbox
on hu.wikisource, it is uncorrected OCR — several canto headings are visibly
garbled — and it covers **656 of 701 verses**:

| | |
|---|---|
| Imported as drafts | 656 |
| Not translated by Schmidt, by his own editorial choice | 19 (1.1–1.19, summarised in prose) |
| Absent from the transcription, needing a translator | 26 — the importer names each one |

So nothing is imported as finished text. Every verse lands as `in-review`,
which means it is **not exported, not indexed, and never used to ground an
answer**, and it renders to readers with an explicit *"unreviewed draft — not
yet checked against the Sanskrit"*.

What it buys is a reviewer's time: a Hungarian speaker opens `/admin/review` to
a 94%-complete draft to check against the Sanskrit, rather than 701 empty boxes.
**Nobody should approve these without reading them** — that is the whole point
of approval being a separate act with a name attached.

### 4. Roles

| Role | May |
|---|---|
| `user` | Their own conversations, key, bookmarks |
| `reviewer` | Edit and approve translations |
| `admin` | The above, plus the voice-guard log, spend, and appointing reviewers |

`ADMIN_EMAILS` is an override, not the storage: an address listed there is an
admin whatever the database says. It is how a fresh deployment gets its first
administrator and how you get back in after a mistake — an admin cannot demote
the last admin account.

Every `/admin` route re-checks server-side. The role on the session is a
rendering hint and is never trusted for access. A signed-in non-reviewer gets
**404**, not 403: whether this application has an administration area is not
something a stranger needs confirmed.

The administration UI is English only, deliberately — see *Known gaps*.

---

## Deploying to Render

`/study` and `/search` deploy cleanly. Three things will bite you, and all three
are about the runtime rather than the code.

**1. SQLite does not survive a deploy.** Render's filesystem is ephemeral, so
every deploy wipes accounts, sessions, saved provider keys, conversations and
the entire Hungarian review queue. Provision a Postgres instance, set
`DATABASE_URL`, and change one line in `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

No model changes are needed. Then `npx prisma migrate deploy`, and re-run
`npm run data:hungarian` to repopulate the review queue.

**2. The embedding model needs memory.** The default `fp32` encoder is ~1.1GB of
weights held in the process. Render's free tier gives 512MB, so `/chat` and
`/search` will be killed on the first query while `/study` carries on working.
Either move to an instance with enough memory, or set `EMBED_DTYPE=q8`
(~280MB, slightly lossy — run `npm run embed:verify` after), or run the Python
sidecar elsewhere and point at it with `EMBED_BACKEND=service`.

The vector index itself is committed, so nothing is downloaded at build time.

**3. OAuth needs the real URL.** Set `NEXTAUTH_URL` to your Render URL and add
`https://<your-app>.onrender.com/api/auth/callback/google` to the authorised
redirect URIs in the Google console, or sign-in fails with a redirect mismatch.

| | |
|---|---|
| Build command | `npm ci && npx prisma generate && npm run build` |
| Start command | `npm start` |
| Required env | `DATABASE_URL` `APP_ENCRYPTION_KEY` `NEXTAUTH_SECRET` `NEXTAUTH_URL` `GOOGLE_CLIENT_ID` `GOOGLE_CLIENT_SECRET` `ADMIN_EMAILS` |

Generate the two secrets fresh for production — do not reuse the local ones:

```bash
openssl rand -base64 32   # APP_ENCRYPTION_KEY
openssl rand -base64 32   # NEXTAUTH_SECRET
```

`APP_ENCRYPTION_KEY` is what every stored provider key is encrypted with.
Change it later and every saved key becomes undecryptable, and users must
re-enter them.

## Before you hand it over

```bash
npm run ship:check
```

One command that answers *is this safe to give to a temple?* It checks the
corpus is complete, that every shipped translation names a translator, source
and licence, that no known-copyrighted text has been pasted in, that the
artwork is open-licensed with accession URLs, that the index matches the corpus,
and that secrets are not committed. Anything it cannot verify is reported as
unverified and counts against the total — **"no news" must never read as "all
well"**, which is exactly how seven images of unknown origin and a retired model
shipped unnoticed.

It exits non-zero on a blocker. Warnings do not fail it, because "Hindi is not
translated yet" is a judgement for the temple, not a bug.

### The caveat rule

**Only `reviewed` text is ever shown without a caveat.** Placeholders say so,
drafts say so more strongly, and anything with an unrecognised status falls to
the cautious side.

That rule now lives in one file
([`src/lib/verses/confidence.ts`](src/lib/verses/confidence.ts)) because it used
to live in four, written out by hand as `status === 'placeholder'`. When a third
status arrived, all four checks silently stopped matching and 656 verses of
unreviewed OCR rendered to Hungarian readers looking exactly like finished
scripture.

## For readers

- **Verse of the day** on the home page. Deterministic from the date, so two
  people can talk about "today's verse" and mean the same one.
- **Search** at `/search`. Public and unauthenticated: finding the verse that
  speaks to a situation costs no AI credit, and a login wall in front of
  public-domain scripture would be the wrong trade. Rate-limited instead —
  20 requests a minute per client, in-memory and per-process (replace the Map
  in `src/lib/http/rateLimit.ts` with Redis if this ever runs on more than one
  instance).
- **Saved verses** and **continue reading**, both per account.
- **Print or save a conversation** from `/chat`. Browser print, so "save as
  PDF" works with no library and no download permission.
- **Offline `/study`**, via a service worker. Narrow on purpose: static assets
  and study pages only. It never touches `/api`, `/chat`, `/settings`,
  `/admin`, `/bookmarks` or sign-in — caching anything that depends on who is
  signed in is how a worker ends up serving one person's state to another.
  Registered in production builds only.

### The background artwork

Seven paintings crossfade behind every page, one every eight seconds. The list
lives in [`src/lib/ui/backgrounds.ts`](src/lib/ui/backgrounds.ts); adding or
removing one means dropping a file in `public/backgrounds/` and adding an entry,
and nothing else in the app knows how many there are.

**Every image is CC0**, from a museum's own public-domain dedication, with an
accession page you can open and check — Cleveland Museum of Art and The Met,
both of which publish open-access APIs. The manifest carries title, artist,
date, holding institution, credit line, source URL and licence for each, and
those fields are **required by the type**: an image with no provenance will not
compile, and `npm test` fails if a licence is anything other than CC0, public
domain or CC BY.

That strictness is the point. An earlier set came from stock sites, print shops
and image boards; not one carried rights metadata, and nothing in the codebase
objected. A licence cannot be read off a file — it comes from knowing where the
file came from. If you cannot answer *"where is this from, and who says I may
use it"*, it does not go in the list.

**Scaling.** Each is `fill` + `object-cover` with `sizes="100vw"`, so Next
serves an AVIF/WebP resized to the reader's actual device width — a phone at
375pt on a 2× screen gets an 828px image, not the 1920px original. The art is
never distorted; what changes with the viewport is how much is cropped, which
is what `position` on each entry controls. It matters here because these range
from 0.76 (portrait) to 1.50 (wide), and centre-cropping the portrait on a
widescreen cuts the faces off.

**Loading.** Only the first image is `priority`. The rest mount one at a time as
the slideshow reaches them, so the first paint costs one image rather than
seven; after one cycle they are all cached and every transition is instant.

**It stops** when the tab is hidden, and when the reader has asked for
`prefers-reduced-motion` — something moving behind text is exactly what that
setting is for. Those readers see the first image, held.

### Why the chat does not stream

Retrieval takes ~50ms; the provider takes closer to ten seconds. Rather than
stream the reply, `/chat` shows the **retrieved verses immediately** and the
answer when it is whole.

That is forced by the voice guard, and it is the right constraint: the guard
has to see a complete reply before any of it is shown. Streaming would mean
displaying text and then retracting it, which is worse than waiting.

---

## Known gaps

- **`word_meanings` is empty for every verse.** Every readily available
  word-by-word gloss for the Gita is still in copyright. These need to be
  authored or licensed.
- **Hungarian is a 94% draft, not a translation.** 656 of 701 verses are in the
  review queue from Schmidt's public-domain rendering; 26 are missing entirely
  and 19 were never translated by Schmidt. None of it is approved, exported or
  indexed. A Hungarian speaker has to read all 656 and supply the 26.
- **Hindi has no source at all.** There is no public-domain Hindi Gítá to draw
  on: `hi.wikisource.org` carries none, and every Hindi translation on the
  Sanskrit API (Tejomayananda, Ramsukhdas, the modern rendering of Śaṅkara) is
  in copyright. This is a **sourcing decision for the temple**, not a coding
  task — commission a translation, obtain permission for an existing one, or
  have a Hindi-speaking devotee work through `/admin/review`. It must not be
  machine-translated: Hindi is far closer to Sanskrit than English is, so
  routing through Besant's 1922 English would produce something strictly worse
  than a direct rendering.
- **UI strings in `hu` and `hi` need native review.** They were machine-written,
  including the strings added for search, bookmarks and the daily verse.
- **The administration UI is English only.** Translating a reviewer's tool with
  machine-written Hungarian, for the people most likely to notice, would be
  worse than leaving it in one language they can read.
- **SQLite does not survive a serverless deploy.** For Vercel, switch
  `provider` in `prisma/schema.prisma` to `postgresql` and change
  `DATABASE_URL`. No model changes needed.
- **Encryption is not zero-knowledge.** User API keys are encrypted at rest with
  `APP_ENCRYPTION_KEY`, which protects against a leaked database — not against
  a compromised server, which must be able to decrypt them to call the provider.
  Say this plainly to users rather than implying more.
- **After the trial, only two of the four providers are actually free.**
  Gemini and Groq issue keys with no payment card. **OpenAI and Anthropic have
  no free API tier at all** — both need prepaid credit, and a consumer
  ChatGPT/Claude subscription does *not* include API access. Settings labels
  each provider accordingly; do not soften that copy, or users will follow a
  "get a free key" prompt into a paywall.

- **Groq vs Gemini is not a simple "which is bigger" question.** Groq's free
  tier allows far more requests per day (~14,400 vs ~250–1,500) but only
  ~6,000 tokens/minute. Each turn of this app sends ~4,000 tokens of retrieved
  verses, so a *shared* Groq key throttles with only a couple of simultaneous
  users. Gemini's ~1M tokens/minute never binds. Hence: **Gemini for the shared
  trial key, Groq as the best key for an individual to bring.**

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Voice guard, citation, crypto and locale-parity tests |
| `npm run data:build` | Build any missing chapters |
| `npm run data:rebuild` | Rebuild all 18 chapters from source |
| `npm run data:export` | Fold approved translations back into the JSON corpus |
| `npm run data:hungarian` | Import Schmidt's Hungarian into the review queue |
| `npm run ship:check` | **Pre-handover gate — run this before giving it to anyone** |
| `npm run models:check` | Verify configured models are still served |
| `npm run embed:index` | Rebuild the vector store (+ retrieval smoke test) |
| `npm run embed:verify` | **Check the index and the app share a vector space** |
| `npm run embed:index:py` | Rebuild the index via Python instead |
| `npm run embed:serve` | Python query-embedding service on :8399 (optional) |
| `npm run db:migrate` | Apply Prisma migrations |

> Do not run `npm run build` while `npm run dev` is running — they share
> `.next/` and the production build will break the dev server until you
> `rm -rf .next` and restart.

### Multiple provider keys

A user may save one key per provider (Gemini, Groq, OpenAI, Anthropic) and hold
several at once. Which one a conversation uses:

1. an explicit `provider` on the chat request — how the UI switches;
2. otherwise the provider pinned on the conversation;
3. otherwise the **most recently saved** key.

The pin is per conversation, not per user, so switching provider mid-thread is
a deliberate act rather than a global setting that silently changes old
threads. Trial conversations are left unpinned on purpose — when the user later
adds their own key, the thread simply continues on it.

The chat UI shows a selector only when the user has **more than one** key; with
zero or one there is nothing to choose. Removing a key that a conversation was
pinned to falls back rather than erroring.

### Token budget per request

Because most users are on a free tier (their own or the trial pool), each turn
is deliberately kept small. Measure it with:

```bash
npm run measure          # needs the embedding service running
```

Current shape, first turn ~**701 tokens**, rising to ~**1,105** at the maximum
retained history:

| Component | Tokens | |
|---|---:|---|
| System prompt | ~496 | resent every turn |
| Verse context (5 verses) | ~196 | |
| User question | ~10 | |
| History | 0–404 | 3 exchanges max, assistant replies truncated to 500 chars |

Three things keep it there, and each will silently regress if edited casually:

1. **Transliteration is not sent to the model.** IAST is display-only data for
   `/study`; it was ~131 tokens per request buying nothing, and it tokenizes
   badly. `buildVerseContext` sends the reference and translation only.
2. **The system prompt is terse on purpose.** It was ~642 tokens of explanatory
   prose. Every *rule* survives; the rationale was cut. Do not re-expand it
   casually — and do not touch the VOICE block, whose wording is load-bearing.
3. **History is capped and truncated.** `HISTORY_TURNS = 3` and assistant
   replies replay at 500 chars. Uncapped history was the largest single cost:
   8 full exchanges added ~2,500 tokens per turn.

Raising `TOP_K` costs ~36 tokens per extra verse.

### Embedding model

`intfloat/multilingual-e5-base` (768-dim, ~1.1GB), reachable two ways:

| Backend | What runs | When to use it |
|---|---|---|
| `local` *(default)* | `Xenova/multilingual-e5-base` ONNX, in the Next.js process | Always, unless the native binding will not install |
| `service` | sentence-transformers via `scripts/embed.py serve` | A host where `onnxruntime-node` fails to build |

They are the same weights and **the same vector space** — measured, not
assumed: re-embedding real index entries through the ONNX path at fp32
reproduces the stored vectors at cosine `1.00000`. `EMBED_DTYPE=q8` is roughly
a quarter of the size and slightly lossy; verify before trusting it.

**Indexing and querying must use the same model.** A query embedded with a
different model than the corpus lands in a different vector space, and the
similarity scores become meaningless while still looking entirely plausible.
Nothing errors. Nothing looks wrong. The answers just stop being grounded.

That failure is invisible by construction, so it gets a command rather than a
comment:

```bash
npm run embed:verify
```

It re-embeds text already in the index through the exact code path `/api/chat`
uses and compares. Run it after changing the model, the dtype, or the backend.
