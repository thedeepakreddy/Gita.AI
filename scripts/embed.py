#!/usr/bin/env python3
"""
Embedding pipeline for Gita Counsel.

Two modes, one model. They must stay one model: a query embedded with a
different model than the corpus lands in a different vector space, and
similarity scores become meaningless (they will still *look* plausible, which
is the dangerous part).

    # 1. Index — embed every translation, write the local vector store.
    .venv/bin/python scripts/embed.py index

    # 2. Serve — expose the same model on localhost so the Next.js app can
    #    embed user queries at request time.
    .venv/bin/python scripts/embed.py serve

Model: intfloat/multilingual-e5-base (768-dim, 100+ languages, ~1.1GB).

BAAI/bge-m3 was the first choice — better retrieval quality, no prefixes
needed — but at ~2.2GB of weights plus torch overhead it does not fit in 8GB
of RAM: the indexing process sat in uninterruptible I/O wait, thrashing
against swap, and never embedded a single verse. e5-base is the largest
multilingual encoder that runs comfortably here, and it covers Devanagari and
Hungarian diacritics well.

Set EMBEDDING_MODEL to override — "BAAI/bge-m3" is worth returning to on a
machine with 16GB+, and "intfloat/multilingual-e5-small" (~470MB) is the
fallback if even this is too heavy. Changing the model invalidates the index:
re-run `index` after any change, or queries land in a different vector space
and similarity scores become meaningless while still looking plausible.

Runs fully offline after the first download; no API key, no paid service.

Weights are cached under ./.hf-cache (gitignored) rather than ~/.cache, so
everything this project downloads stays inside the project folder.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Keep model weights inside the project. Must be set before importing
# sentence_transformers / huggingface_hub.
os.environ.setdefault("HF_HOME", str(PROJECT_ROOT / ".hf-cache"))

MODEL_NAME = os.environ.get("EMBEDDING_MODEL", "intfloat/multilingual-e5-base")
VERSES_DIR = PROJECT_ROOT / "data" / "verses"
STORE_PATH = PROJECT_ROOT / "data" / "embeddings" / "vectors.json"
DEFAULT_PORT = int(os.environ.get("EMBED_PORT", "8399"))

_model = None

# The model itself is serialized: torch modules are not reliably safe for
# concurrent forward passes, and on a memory-constrained host parallel batches
# are counterproductive anyway. The *server* is threaded (see cmd_serve) so
# callers queue on this lock instead of on the accept backlog — a slow reply
# beats a connection timeout.
_encode_lock = threading.Lock()


def get_model():
    """Load lazily — importing torch is slow, and `--help` shouldn't pay for it."""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer

        print(f"Loading {MODEL_NAME} (first run downloads the weights: ~1.1GB for e5-base)…", file=sys.stderr)
        _model = SentenceTransformer(MODEL_NAME)
        print("Model ready.", file=sys.stderr)
    return _model


def needs_e5_prefix() -> bool:
    """
    The e5 family is trained with asymmetric "query:"/"passage:" prefixes and
    loses noticeable retrieval quality without them. bge-m3 must NOT get them.
    """
    return "e5" in MODEL_NAME.lower()


def apply_prefix(texts: list[str], mode: str) -> list[str]:
    if not needs_e5_prefix():
        return texts
    tag = "query: " if mode == "query" else "passage: "
    return [tag + t for t in texts]


def embed_texts(texts: list[str], mode: str = "query") -> list[list[float]]:
    """
    Embed and L2-normalize, so cosine similarity reduces to a dot product.

    `mode` is "passage" for corpus text at index time and "query" for a user's
    question at search time. Getting this backwards silently degrades results
    rather than erroring, so both call sites pass it explicitly.
    """
    model = get_model()
    with _encode_lock:
        vectors = model.encode(
            apply_prefix(texts, mode),
            normalize_embeddings=True,
            show_progress_bar=len(texts) > 8,
            batch_size=4,  # small batches keep peak memory low on constrained machines
        )
    return [v.tolist() for v in vectors]


def load_chapters() -> list[dict[str, Any]]:
    files = sorted(VERSES_DIR.rglob("chapter-*.json"))
    if not files:
        raise SystemExit(f"No chapter files under {VERSES_DIR}. Run scripts/build-chapter.mjs first.")
    return [json.loads(p.read_text(encoding="utf-8")) for p in files]


def cmd_index(args: argparse.Namespace) -> None:
    chapters = load_chapters()

    # Flatten to (verse, locale, text). One entry per translated language, so a
    # Hungarian question matches Hungarian text directly rather than via English.
    entries: list[dict[str, Any]] = []
    for chapter in chapters:
        for verse in chapter["verses"]:
            for locale, text in (verse.get("translations") or {}).items():
                if not text or not text.strip():
                    continue
                entries.append(
                    {
                        "verseId": verse["id"],
                        "scripture": verse["scripture"],
                        "chapter": verse["chapter"],
                        "verse": verse["verse"],
                        "locale": locale,
                        "text": text.strip(),
                    }
                )

    if not entries:
        raise SystemExit("Nothing to embed — no non-empty translations found.")

    print(f"Embedding {len(entries)} verse-translations from {len(chapters)} chapter(s)…")
    vectors = embed_texts([e["text"] for e in entries], mode="passage")

    dim = len(vectors[0])
    store = {
        "model": MODEL_NAME,
        "dimensions": dim,
        "normalized": True,
        "e5Prefixes": needs_e5_prefix(),
        "count": len(entries),
        "entries": [
            {**entry, "vector": [round(x, 6) for x in vec]}
            for entry, vec in zip(entries, vectors)
        ],
    }

    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STORE_PATH.write_text(json.dumps(store), encoding="utf-8")
    size_mb = STORE_PATH.stat().st_size / 1_048_576
    print(f"Wrote {STORE_PATH} — {len(entries)} vectors, {dim} dims, {size_mb:.1f} MB")

    if args.smoke_test:
        run_smoke_test(store)


def ref_of(entry: dict[str, Any]) -> str:
    return f"{entry['chapter']}.{entry['verse']}"


def top_matches(store: dict[str, Any], qvec: list[float], k: int) -> list[tuple[float, dict]]:
    """Linear scan; vectors are normalized so a dot product is cosine similarity."""
    best: dict[str, tuple[float, dict]] = {}
    for entry in store["entries"]:
        score = sum(a * b for a, b in zip(qvec, entry["vector"]))
        ref = ref_of(entry)
        if ref not in best or score > best[ref][0]:
            best[ref] = (score, entry)
    return sorted(best.values(), key=lambda x: -x[0])[:k]


def run_smoke_test(store: dict[str, Any]) -> None:
    """
    Sanity-check that retrieval surfaces the verse a human would expect.

    Expectations are full "chapter.verse" references. They were bare verse
    numbers while the corpus was chapter 2 only; once all 18 chapters were
    indexed that silently compared verse numbers across chapters and both
    mislabelled and mis-scored every result. Keep these as refs.
    """
    probes = [
        ("my mind is confused about my duty and I cannot decide", "2.7"),
        ("should I worry about the results of my work", "2.47"),
        ("everyone will think I am a coward if I walk away", "2.35"),
        ("what happens to the soul when the body dies", "2.22"),
    ]
    print("\nSmoke test:")
    query_vectors = embed_texts([p[0] for p in probes], mode="query")

    hits = 0
    for (query, expected), qvec in zip(probes, query_vectors):
        scored = top_matches(store, qvec, 5)
        refs = [ref_of(e) for _, e in scored]
        hit = expected in refs
        hits += hit
        print(f"  {'✓' if hit else '·'} {query!r}")
        print(f"      top5: {', '.join(refs)}   (expected {expected})")
        print(f"      best: {refs[0]} @ {scored[0][0]:.3f} — {scored[0][1]['text'][:88]}")

    print(f"\n  {hits}/{len(probes)} probes matched their expected verse.")
    if hits < len(probes):
        print("  Semantic match is fuzzy and a near-miss is often a fine answer —")
        print("  read the 'best' lines above before treating this as a failure.")


def cmd_search(args: argparse.Namespace) -> None:
    """Query the existing index from the CLI, without re-embedding the corpus."""
    if not STORE_PATH.exists():
        raise SystemExit(f"No index at {STORE_PATH}. Run `embed.py index` first.")
    store = json.loads(STORE_PATH.read_text(encoding="utf-8"))

    if store.get("model") != MODEL_NAME:
        print(
            f"WARNING: index was built with {store.get('model')!r} but this process "
            f"uses {MODEL_NAME!r}. Scores will be meaningless — re-run `index`.",
            file=sys.stderr,
        )

    qvec = embed_texts([args.query], mode="query")[0]
    for score, entry in top_matches(store, qvec, args.k):
        print(f"{ref_of(entry):>7}  {score:.3f}  [{entry['locale']}] {entry['text'][:110]}")


class EmbedHandler(BaseHTTPRequestHandler):
    """Minimal JSON endpoint: POST /embed {"texts": [...]} -> {"vectors": [...]}."""

    def _send(self, code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._send(200, {"ok": True, "model": MODEL_NAME})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/embed":
            self._send(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            texts = payload.get("texts") or []
            if not isinstance(texts, list) or not all(isinstance(t, str) for t in texts):
                self._send(400, {"error": "texts must be an array of strings"})
                return
            if not texts:
                self._send(400, {"error": "texts must not be empty"})
                return
            if len(texts) > 32:
                self._send(400, {"error": "at most 32 texts per request"})
                return
            mode = payload.get("mode", "query")
            if mode not in ("query", "passage"):
                self._send(400, {"error": 'mode must be "query" or "passage"'})
                return
            self._send(
                200,
                {"vectors": embed_texts(texts, mode=mode), "model": MODEL_NAME},
            )
        except Exception as exc:  # noqa: BLE001
            self._send(500, {"error": str(exc)})

    def log_message(self, *_args: Any) -> None:
        pass  # quiet


def cmd_serve(args: argparse.Namespace) -> None:
    get_model()  # warm before accepting traffic
    # Bound to loopback deliberately: this endpoint has no auth and should not
    # be reachable off the host.
    server = ThreadingHTTPServer(("127.0.0.1", args.port), EmbedHandler)
    print(f"Embedding service on http://127.0.0.1:{args.port} (POST /embed)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p_index = sub.add_parser("index", help="embed all verses and write the vector store")
    p_index.add_argument("--smoke-test", action="store_true", help="run retrieval probes after indexing")
    p_index.set_defaults(func=cmd_index)

    p_serve = sub.add_parser("serve", help="serve query embeddings on localhost")
    p_serve.add_argument("--port", type=int, default=DEFAULT_PORT)
    p_serve.set_defaults(func=cmd_serve)

    p_search = sub.add_parser("search", help="query the existing index from the CLI")
    p_search.add_argument("query")
    p_search.add_argument("-k", type=int, default=5)
    p_search.set_defaults(func=cmd_search)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
