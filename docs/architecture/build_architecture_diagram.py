"""Generate the DataQuest system-architecture diagram as an Excalidraw scene.

Emits `dataquest-backend.excalidraw` (open it with the Excalidraw editor / VS Code
extension; export PNG or SVG from there). Hand-writing raw Excalidraw JSON is where
mismatched ids and broken arrow bindings creep in, so the scene is built from small
element factories that keep every rectangle, bound label, and arrow valid by construction.

Re-run after the backend changes to keep the picture in sync with the code:
    backend/.venv/Scripts/python.exe docs/architecture/build_architecture_diagram.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

OUT = Path(__file__).with_name("dataquest-backend.excalidraw")
OUT_SVG = Path(__file__).with_name("dataquest-backend.svg")
STAMP = 1735689600000  # fixed `updated` timestamp -> deterministic output (clean diffs)

_elements: list[dict] = []
_geo: dict[str, tuple[float, float, float, float]] = {}  # id -> (x, y, w, h)
_seed = 1000


def _next_seed() -> int:
    global _seed
    _seed += 1
    return _seed


def _base(el_id: str, kind: str, x: float, y: float, w: float, h: float,
          stroke: str, bg: str) -> dict:
    return {
        "id": el_id, "type": kind, "x": x, "y": y, "width": w, "height": h,
        "angle": 0, "strokeColor": stroke, "backgroundColor": bg,
        "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
        "roughness": 1, "opacity": 100, "groupIds": [], "frameId": None,
        "roundness": None, "seed": _next_seed(), "version": 1,
        "versionNonce": _next_seed(), "isDeleted": False, "boundElements": [],
        "updated": STAMP, "link": None, "locked": False,
    }


def _text_el(el_id: str, x: float, y: float, w: float, h: float, txt: str,
             *, color: str, size: int, family: int, align: str,
             valign: str, container: str | None) -> dict:
    el = _base(el_id, "text", x, y, w, h, color, "transparent")
    el.update({
        "text": txt, "originalText": txt, "fontSize": size, "fontFamily": family,
        "textAlign": align, "verticalAlign": valign, "containerId": container,
        "lineHeight": 1.25, "baseline": size,
    })
    return el


def zone(zid: str, x: float, y: float, w: float, h: float, *, bg: str,
         stroke: str, title: str) -> None:
    """A big rounded lane background with a top-left title (title is not bound)."""
    rect = _base(zid, "rectangle", x, y, w, h, stroke, bg)
    rect["roundness"] = {"type": 3}
    rect["strokeWidth"] = 1
    rect["opacity"] = 100
    _elements.append(rect)
    _geo[zid] = (x, y, w, h)
    _elements.append(_text_el(
        f"{zid}__title", x + 18, y + 12, w - 36, 24, title,
        color=stroke, size=18, family=2, align="left", valign="top", container=None,
    ))


def node(nid: str, x: float, y: float, w: float, h: float, txt: str, *,
         bg: str, stroke: str, size: int = 15, family: int = 2,
         text_color: str = "#1e1e1e") -> str:
    """A rounded box with a centered, wrapped, container-bound label."""
    rect = _base(nid, "rectangle", x, y, w, h, stroke, bg)
    rect["roundness"] = {"type": 3}
    tid = f"{nid}__t"
    rect["boundElements"] = [{"type": "text", "id": tid}]
    _elements.append(rect)
    _geo[nid] = (x, y, w, h)

    lines = txt.split("\n")
    th = len(lines) * size * 1.25
    _elements.append(_text_el(
        tid, x + 8, y + (h - th) / 2, w - 16, th, txt,
        color=text_color, size=size, family=family,
        align="center", valign="middle", container=nid,
    ))
    return nid


def _wrap(txt: str, n: int) -> str:
    """Greedy word-wrap to <= n chars per line (Excalidraw does NOT auto-wrap unbound text)."""
    out, line = [], ""
    for word in txt.split(" "):
        if line and len(line) + 1 + len(word) > n:
            out.append(line)
            line = word
        else:
            line = f"{line} {word}".strip()
    if line:
        out.append(line)
    return "\n".join(out)


def free_text(x: float, y: float, txt: str, *, color: str = "#495057",
              size: int = 13, family: int = 2, width: float | None = None,
              wrap_chars: int | None = None) -> int:
    """Add a left-aligned unbound text. Returns the rendered line count (for layout stepping)."""
    if wrap_chars:
        txt = _wrap(txt, wrap_chars)
    lines = txt.split("\n")
    w = width if width is not None else max(len(ln) for ln in lines) * size * 0.58
    h = len(lines) * size * 1.25
    _elements.append(_text_el(
        f"free_{_next_seed()}", x, y, w, h, txt,
        color=color, size=size, family=family, align="left", valign="top", container=None,
    ))
    return len(lines)


def _edge(from_id: str, to_id: str, sx: float, sy: float, ex: float, ey: float,
          *, color: str, dashed: bool) -> None:
    aid = f"arrow_{from_id}_{to_id}_{_next_seed()}"
    el = _base(aid, "arrow", sx, sy, abs(ex - sx), abs(ey - sy), color, "transparent")
    el["roundness"] = {"type": 2}
    el["strokeWidth"] = 2
    if dashed:
        el["strokeStyle"] = "dashed"
    el.update({
        "points": [[0, 0], [ex - sx, ey - sy]],
        "lastCommittedPoint": None,
        "startBinding": {"elementId": from_id, "focus": 0, "gap": 6},
        "endBinding": {"elementId": to_id, "focus": 0, "gap": 6},
        "startArrowhead": None, "endArrowhead": "arrow",
    })
    for eid in (from_id, to_id):
        for e in _elements:
            if e["id"] == eid:
                e["boundElements"] = (e.get("boundElements") or []) + [{"type": "arrow", "id": aid}]
    _elements.append(el)


def flow_down(from_id: str, to_id: str, *, label: str | None = None,
              color: str = "#343a40", dashed: bool = False) -> None:
    fx, fy, fw, fh = _geo[from_id]
    tx, ty, tw, th = _geo[to_id]
    sx, sy = fx + fw / 2, fy + fh
    ex, ey = tx + tw / 2, ty
    _edge(from_id, to_id, sx, sy, ex, ey, color=color, dashed=dashed)
    if label:
        free_text(sx + 22, (sy + ey) / 2 - 18, label, color=color, size=13, width=560)


def flow_right(from_id: str, to_id: str, *, label: str | None = None,
               color: str = "#868e96") -> None:
    fx, fy, fw, fh = _geo[from_id]
    tx, ty, tw, th = _geo[to_id]
    sx, sy = fx + fw, fy + fh / 2
    ex, ey = tx, ty + th / 2
    _edge(from_id, to_id, sx, sy, ex, ey, color=color, dashed=False)
    if label:
        free_text((sx + ex) / 2 - 26, sy - 30, label, color=color, size=12, width=120)


# ── Palette (Excalidraw swatches) ────────────────────────────────────────────────
SRC = dict(bg="#fff9db", stroke="#f08c00", box="#ffec99")   # upstream sources — yellow
WRK = dict(bg="#e7f5ff", stroke="#1971c2", box="#a5d8ff")   # ingest worker  — blue
STO = dict(bg="#ebfbee", stroke="#2f9e44", box="#b2f2bb")   # store          — green
API = dict(bg="#f3f0ff", stroke="#6741d9", box="#d0bfff")   # read api       — violet
FE  = dict(bg="#fff0f6", stroke="#c2255c", box="#fcc2d7")   # dashboard      — pink
LEG = dict(bg="#f8f9fa", stroke="#495057")                  # legend         — gray

MX, ZW = 80, 1180  # left margin, lane width

# ── Title ────────────────────────────────────────────────────────────────────────
free_text(MX, 0, "DataQuest — System Architecture", color="#1e1e1e", size=28, family=2, width=900)
free_text(MX, 42,
          "Point-in-time (vintage) macro-data service  ·  read-never-fetches  ·  per-series licence gate",
          color="#868e96", size=14, width=900)

# ── 1. UPSTREAM SOURCES ────────────────────────────────────────────────────────────
sy = 82
zone("z_src", MX, sy, ZW, 150, bg=SRC["bg"], stroke=SRC["stroke"],
     title="UPSTREAM SOURCES  —  public-domain / GREEN")
node("src_alfred", MX + 30, sy + 52, 340, 78,
     "ALFRED / FRED API\nUS macro vintages (BLS · BEA · Census · Fed · Treasury)\nregime A vintages  +  ALFRED_LATEST for rates (regime B)",
     bg=SRC["box"], stroke=SRC["stroke"], size=13)
node("src_ecb", MX + 420, sy + 52, 340, 78,
     "ECB reference rates\neuro FX (EUR/USD), XML\nregime B  ·  commercial_ok = TRUE",
     bg=SRC["box"], stroke=SRC["stroke"], size=13)
node("src_philly", MX + 810, sy + 52, 340, 78,
     "Philadelphia Fed RTDS\nReal-Time Data Set (files)\nregime A vintages  ·  off-FRED re-source",
     bg=SRC["box"], stroke=SRC["stroke"], size=13)

# ── 2. INGEST WORKER ───────────────────────────────────────────────────────────────
wy = 290
zone("z_wrk", MX, wy, ZW, 270, bg=WRK["bg"], stroke=WRK["stroke"],
     title="INGEST WORKER  —  sync · scheduled · off the request path  (Fly scheduled machine)")
node("wrk_run", MX + 30, wy + 48, ZW - 60, 44,
     "run.py  —  for each catalog series:  fetch → normalize → load   (uv run python -m app.ingest.run)",
     bg=WRK["box"], stroke=WRK["stroke"], size=14)
node("wrk_tet", MX + 30, wy + 108, 560, 96,
     "TET Fetcher  (one per source)\ntransform_query → extract_data → transform_data\n→ QdfRow[] + Provenance   ·   Fetchers: Alfred · FredLatest · Ecb · PhillyFedRtds",
     bg=WRK["box"], stroke=WRK["stroke"], size=13)
node("wrk_err", MX + 620, wy + 108, 530, 96,
     "Ground-or-skip on typed errors\nEmptyData · Unavailable · NeedsKey\na failed fetch is SKIPPED, never stored as a fabricated value",
     bg="#ffe3e3", stroke="#e03131", size=13)
node("wrk_load", MX + 30, wy + 216, ZW - 60, 40,
     "load_rows  →  idempotent upsert · ON CONFLICT (series_id, obs, vintage) DO NOTHING · append-only   (sync engine)",
     bg=WRK["box"], stroke=WRK["stroke"], size=13)

# ── 3. STORE ───────────────────────────────────────────────────────────────────────
ty = 620
zone("z_sto", MX, ty, ZW, 250, bg=STO["bg"], stroke=STO["stroke"],
     title="STORE  —  Postgres  (+ TimescaleDB extension)")
node("sto_product", MX + 30, ty + 56, 300, 110,
     "dataproduct\nproduct_id (PK)\ntitle · theme · sort_order\n(Fusion-style grouping)",
     bg=STO["box"], stroke=STO["stroke"], size=13)
node("sto_series", MX + 420, ty + 56, 340, 150,
     "series   (catalog)\nseries_id = cid_xcat (PK)\ncid · xcat · source · regime A/B\nvintage_capable · commercial_ok\nattribution · qdf_ticker · product_id (FK)",
     bg=STO["box"], stroke=STO["stroke"], size=13)
node("sto_obs", MX + 830, ty + 56, 320, 150,
     "observation   (vintage panel)\nseries_id (FK) · observation_date\nvintage_date · value\nUNIQUE (series_id, obs, vintage)\nPIT INDEX (… , vintage_date DESC)",
     bg=STO["box"], stroke=STO["stroke"], size=13)
flow_right("sto_product", "sto_series", label="1 : N")
flow_right("sto_series", "sto_obs", label="1 : N")
free_text(MX + 30, ty + 216,
          "Alembic migrations own the schema (tables · the PIT index · the unique constraint).   "
          "PIT_SQL = SELECT DISTINCT ON (obs) … WHERE vintage_date <= :as_of ORDER BY obs, vintage_date DESC  (index-only, no Sort).",
          color="#2b8a3e", size=12, width=1120)

# ── 4. READ API ────────────────────────────────────────────────────────────────────
ay = 950
zone("z_api", MX, ay, ZW, 320, bg=API["bg"], stroke=API["stroke"],
     title="READ API  —  FastAPI  (async · persistent on Fly · NO httpx)")
node("api_mw", MX + 30, ay + 48, ZW - 60, 42,
     "CorrelationId  ▸  CORS  ▸  rate-limit (per client IP)  ▸  RFC-9457 problem+json   ·   GET /health",
     bg="#e5dbff", stroke=API["stroke"], size=13)
rw = 216
node("api_series", MX + 30, ay + 108, rw, 118,
     "/series\n/{ticker}?as_of\n(PIT core)\n/panel · /revisions\n/revision-stats",
     bg=API["box"], stroke=API["stroke"], size=12, family=3)
node("api_catalog", MX + 30 + rw + 12, ay + 108, rw, 118,
     "/catalog\n/  (filter +\n paginate)\n/reliability\n/{ticker}",
     bg=API["box"], stroke=API["stroke"], size=12, family=3)
node("api_products", MX + 30 + 2 * (rw + 12), ay + 108, rw, 118,
     "/products\n/\n/{id}\n(grouping +\n rollup gate)",
     bg=API["box"], stroke=API["stroke"], size=12, family=3)
node("api_obs", MX + 30 + 3 * (rw + 12), ay + 108, rw, 118,
     "/observations\n/  (bulk PIT,\n many tickers,\n ONE query)",
     bg=API["box"], stroke=API["stroke"], size=12, family=3)
node("api_qdf", MX + 30 + 4 * (rw + 12), ay + 108, rw - 8, 118,
     "/qdf\n/  (macrosynergy-\n loadable\n long QDF)",
     bg=API["box"], stroke=API["stroke"], size=12, family=3)
node("api_engine", MX + 30, ay + 240, ZW - 60, 42,
     "async engine (asyncpg) · get_async_session   |   PIT_SQL / PIT_SQL_BULK / REVISIONS_SQL   |   LTTB downsample (max_points) · revision_stats (bias test)",
     bg="#e5dbff", stroke=API["stroke"], size=12)
free_text(MX + 30, ay + 26, "prefix  /api/v1", color="#6741d9", size=13, family=3, width=200)

# ── 5. DASHBOARD ───────────────────────────────────────────────────────────────────
fy = 1350
zone("z_fe", MX, fy, ZW, 150, bg=FE["bg"], stroke=FE["stroke"],
     title="DASHBOARD  —  React · Vite · Tailwind · shadcn · ECharts · TanStack Query")
node("fe_home", MX + 30, fy + 56, 270, 70,
     "Home\n(Analysis dashboard)", bg=FE["box"], stroke=FE["stroke"], size=13)
node("fe_catalog", MX + 320, fy + 56, 260, 70,
     "Data Catalog\n(product cards)", bg=FE["box"], stroke=FE["stroke"], size=13)
node("fe_insights", MX + 600, fy + 56, 260, 70,
     "Data Insights\n(revision studies)", bg=FE["box"], stroke=FE["stroke"], size=13)
node("fe_explore", MX + 880, fy + 56, 270, 70,
     "Open Data Exploration\n(catalog browse)", bg=FE["box"], stroke=FE["stroke"], size=13)

# ── Vertical flow between the five planes ───────────────────────────────────────────
flow_down("z_src", "z_wrk",
          label="①  ONLY the worker fetches upstream  (httpx lives here)", color="#e8590c")
flow_down("z_wrk", "z_sto", label="②  writes  (sync engine, append-only)", color="#1971c2")
flow_down("z_sto", "z_api",
          label="③  reads  (async · asyncpg)  —  read-never-fetches: this app has NO httpx",
          color="#2f9e44", dashed=True)
flow_down("z_api", "z_fe", label="④  HTTP / JSON  (getJson)  ·  /health badge", color="#c2255c")

# ── Legend: the rules that shape the architecture ──────────────────────────────────
lx = MX + ZW + 60
zone("z_leg", lx, 290, 380, 560, bg=LEG["bg"], stroke=LEG["stroke"],
     title="The rules that shape it")
bullets = [
    ("Read never fetches", "Only the worker holds httpx; the read app has none — enforced by the file tree."),
    ("Never invent a number", "A failed fetch returns a typed 'unavailable' and is skipped, never a fabricated value."),
    ("commercial_ok gate", "Per-series licence verdict, default FALSE. TRUE only for a cleared GREEN fetch path; rendered with attribution. Products roll up with a contamination-safe AND."),
    ("Point-in-time is the moat", "Append-only vintage panel; the PIT query is index-only on (series_id, observation_date, vintage_date DESC)."),
    ("Two Fly deployables", "One Python codebase → a persistent Read API + a scheduled Worker. Not serverless (a shared pool can't live on Vercel-style functions)."),
    ("QDF channel", "/qdf emits a long (cid, xcat, real_date, value) frame that loads straight into the open macrosynergy package."),
]
by = 340
for head, body in bullets:
    free_text(lx + 20, by, f"● {head}", color="#212529", size=14, width=340)
    n_lines = free_text(lx + 34, by + 20, body, color="#495057", size=12, wrap_chars=44)
    by += 20 + n_lines * 15 + 16

# ── Serialize the Excalidraw scene ─────────────────────────────────────────────────
scene = {
    "type": "excalidraw",
    "version": 2,
    "source": "https://excalidraw.com",
    "elements": _elements,
    "appState": {"gridSize": None, "viewBackgroundColor": "#ffffff"},
    "files": {},
}
OUT.write_text(json.dumps(scene, indent=2), encoding="utf-8")
print(f"wrote {OUT}  ({len(_elements)} elements)")


# ── Also render a plain, directly-openable SVG from the same geometry ───────────────
# Clean vector output (not the hand-drawn Excalidraw style) that opens in any browser or
# editor with no import step — the "just let me see it" surface.
def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _font(family: int) -> str:
    if family == 3:
        return "ui-monospace, 'Cascadia Code', 'Courier New', monospace"
    return "'Segoe UI', system-ui, -apple-system, sans-serif"


def render_svg(elements: list[dict]) -> str:
    pad = 40
    xs = [e["x"] for e in elements] + [e["x"] + e["width"] for e in elements]
    ys = [e["y"] for e in elements] + [e["y"] + e["height"] for e in elements]
    minx, miny = min(xs) - pad, min(ys) - pad
    w, h = (max(xs) - minx + pad), (max(ys) - miny + pad)

    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0f}" height="{h:.0f}" '
        f'viewBox="{minx:.0f} {miny:.0f} {w:.0f} {h:.0f}" font-family="{_font(2)}">',
        f'<rect x="{minx:.0f}" y="{miny:.0f}" width="{w:.0f}" height="{h:.0f}" fill="#ffffff"/>',
    ]

    # Rectangles first (zones + nodes), so text and arrows draw on top.
    for e in (x for x in elements if x["type"] == "rectangle"):
        fill = "none" if e["backgroundColor"] == "transparent" else e["backgroundColor"]
        rx = 12 if e.get("roundness") else 0
        out.append(
            f'<rect x="{e["x"]:.1f}" y="{e["y"]:.1f}" width="{e["width"]:.1f}" '
            f'height="{e["height"]:.1f}" rx="{rx}" fill="{fill}" stroke="{e["strokeColor"]}" '
            f'stroke-width="{e["strokeWidth"]}"/>'
        )

    # Arrows (straight line + a filled arrowhead polygon oriented along the segment).
    for e in (x for x in elements if x["type"] == "arrow"):
        (x0, y0), (dx, dy) = e["points"][0], e["points"][-1]
        sx, sy = e["x"] + x0, e["y"] + y0
        ex, ey = e["x"] + dx, e["y"] + dy
        dash = ' stroke-dasharray="8 6"' if e.get("strokeStyle") == "dashed" else ""
        out.append(
            f'<line x1="{sx:.1f}" y1="{sy:.1f}" x2="{ex:.1f}" y2="{ey:.1f}" '
            f'stroke="{e["strokeColor"]}" stroke-width="{e["strokeWidth"]}"{dash}/>'
        )
        ang = math.atan2(ey - sy, ex - sx)
        L, spread = 14, math.radians(22)
        p1 = (ex - L * math.cos(ang - spread), ey - L * math.sin(ang - spread))
        p2 = (ex - L * math.cos(ang + spread), ey - L * math.sin(ang + spread))
        out.append(
            f'<polygon points="{ex:.1f},{ey:.1f} {p1[0]:.1f},{p1[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}" '
            f'fill="{e["strokeColor"]}"/>'
        )

    # Text (multi-line via tspans). Container-bound text centres in its box; free text is left-aligned.
    for e in (x for x in elements if x["type"] == "text"):
        lines = e["text"].split("\n")
        fs, lh = e["fontSize"], e["fontSize"] * 1.25
        centred = bool(e.get("containerId"))
        tx = e["x"] + e["width"] / 2 if centred else e["x"]
        anchor = "middle" if centred else "start"
        tspans = "".join(
            f'<tspan x="{tx:.1f}" y="{e["y"] + fs + i * lh:.1f}">{_esc(ln)}</tspan>'
            for i, ln in enumerate(lines)
        )
        out.append(
            f'<text text-anchor="{anchor}" font-family="{_font(e["fontFamily"])}" '
            f'font-size="{fs}" fill="{e["strokeColor"]}">{tspans}</text>'
        )

    out.append("</svg>")
    return "\n".join(out)


OUT_SVG.write_text(render_svg(_elements), encoding="utf-8")
print(f"wrote {OUT_SVG}")
