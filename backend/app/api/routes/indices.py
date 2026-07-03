"""Index Lab read endpoints — list indices, one index's rules, its point-in-time composition, and
the rebalance changes. Reads ONLY our store (read never fetches; the worker builds compositions).

    GET /api/v1/indices                                  -> the index list (+ latest summary)
    GET /api/v1/indices/{index_id}                        -> one index: rules-as-data + latest summary
    GET /api/v1/indices/{index_id}/composition?as_of=&rebalance=  -> the PIT composition (the star)
    GET /api/v1/indices/{index_id}/changes?since=         -> what changed between the two latest rebalances

Every response carries the per-index `commercial_ok` + `attribution` licence gate, like every route.
"""

from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.db import get_async_session
from app.core.errors import IndexDataNotFound, IndexNotFound
from app.models import IndexDefinition

router = APIRouter(prefix="/indices", tags=["indices"])

# Per-index summary AS KNOWN ON :as_of — the latest rebalance, its latest vintage, and eligible/excluded
# counts. Walks ix_idxcomp_pit (index_id, rebalance_date, vintage_date DESC). Used by the list + detail.
_SUMMARY_SQL = text(
    """
    WITH latest_rb AS (
        SELECT index_id, max(rebalance_date) AS rebalance_date
        FROM indexcomposition
        WHERE vintage_date <= :as_of
        GROUP BY index_id
    ), latest_v AS (
        SELECT c.index_id, c.rebalance_date, max(c.vintage_date) AS vintage_date
        FROM indexcomposition c
        JOIN latest_rb r ON c.index_id = r.index_id AND c.rebalance_date = r.rebalance_date
        WHERE c.vintage_date <= :as_of
        GROUP BY c.index_id, c.rebalance_date
    )
    SELECT v.index_id, v.rebalance_date, v.vintage_date,
           count(*) FILTER (WHERE c.eligible)     AS n_eligible,
           count(*) FILTER (WHERE NOT c.eligible) AS n_excluded
    FROM latest_v v
    JOIN indexcomposition c
      ON c.index_id = v.index_id AND c.rebalance_date = v.rebalance_date AND c.vintage_date = v.vintage_date
    GROUP BY v.index_id, v.rebalance_date, v.vintage_date
    """
)

# The point-in-time composition: for :index_id, the latest rebalance with a vintage <= :as_of (or the
# specific :rebalance if given), taken at its newest vintage <= :as_of, all constituents. Same PIT shape
# as the observation store, walking ix_idxcomp_pit.
_COMPOSITION_PIT = text(
    """
    WITH picked AS (
        SELECT rebalance_date, max(vintage_date) AS vintage_date
        FROM indexcomposition
        WHERE index_id = :index_id
          AND vintage_date <= :as_of
          -- CAST so asyncpg can infer the type when :rebalance is NULL (it can't from `IS NULL` alone)
          AND (CAST(:rebalance AS date) IS NULL OR rebalance_date = CAST(:rebalance AS date))
        GROUP BY rebalance_date
        ORDER BY rebalance_date DESC
        LIMIT 1
    )
    SELECT c.constituent_id, c.constituent_name, c.cid, c.face_amount,
           c.raw_weight, c.capped_weight, c.eligible, c.eligibility_reason,
           p.rebalance_date, p.vintage_date
    FROM indexcomposition c
    JOIN picked p ON c.rebalance_date = p.rebalance_date AND c.vintage_date = p.vintage_date
    WHERE c.index_id = :index_id
    ORDER BY c.eligible DESC, c.capped_weight DESC, c.constituent_id
    """
)


class IndexSummary(BaseModel):
    index_id: str
    title: str
    description: str
    family: str
    universe: str
    currency: str
    cap_scheme: str
    commercial_ok: bool
    attribution: str
    latest_rebalance: date | None
    n_eligible: int
    n_excluded: int


class IndexRulesOut(BaseModel):
    income_ceiling_usd: float | None
    min_face_usd_mn: float
    min_maturity_years: float
    exit_maturity_months: float
    cap_scheme: str
    cap_pct: float | None
    rebalance_rule: str


class IndexDetail(IndexSummary):
    rules: IndexRulesOut
    methodology_note: str
    doc_version: str
    latest_vintage: date | None


class ConstituentOut(BaseModel):
    constituent_id: str
    constituent_name: str
    cid: str
    face_amount: float
    raw_weight: float
    capped_weight: float
    eligible: bool
    eligibility_reason: str


class CompositionResponse(BaseModel):
    index_id: str
    as_of: date
    rebalance_date: date
    vintage_date: date
    commercial_ok: bool
    attribution: str
    n_eligible: int
    n_excluded: int
    constituents: list[ConstituentOut]


class IndexChange(BaseModel):
    constituent_id: str
    constituent_name: str
    kind: str  # "added" | "dropped" | "reweighted"
    old_weight: float | None
    new_weight: float | None


class ChangesResponse(BaseModel):
    index_id: str
    from_rebalance: date | None
    to_rebalance: date | None
    changes: list[IndexChange]


async def _summaries(session: AsyncSession, as_of: date) -> dict[str, dict]:
    """Per-index {index_id -> {rebalance_date, vintage_date, n_eligible, n_excluded}} as known on as_of."""
    rows = (await session.execute(_SUMMARY_SQL, {"as_of": as_of})).all()
    return {
        r.index_id: {
            "rebalance_date": r.rebalance_date,
            "vintage_date": r.vintage_date,
            "n_eligible": r.n_eligible,
            "n_excluded": r.n_excluded,
        }
        for r in rows
    }


@router.get("", response_model=list[IndexSummary], operation_id="list_indices")
async def list_indices(session: AsyncSession = Depends(get_async_session)) -> list[IndexSummary]:
    """List the indices with their latest-composition summary (ordered for the Index Lab list)."""
    as_of = date.today()
    defns = (
        await session.execute(select(IndexDefinition).order_by(IndexDefinition.sort_order))
    ).scalars().all()
    summ = await _summaries(session, as_of)
    return [
        IndexSummary(
            index_id=d.index_id, title=d.title, description=d.description, family=d.family,
            universe=d.universe, currency=d.currency, cap_scheme=d.cap_scheme,
            commercial_ok=d.commercial_ok, attribution=d.attribution,
            latest_rebalance=summ.get(d.index_id, {}).get("rebalance_date"),
            n_eligible=summ.get(d.index_id, {}).get("n_eligible", 0),
            n_excluded=summ.get(d.index_id, {}).get("n_excluded", 0),
        )
        for d in defns
    ]


@router.get("/{index_id}", response_model=IndexDetail, operation_id="get_index")
async def get_index(index_id: str, session: AsyncSession = Depends(get_async_session)) -> IndexDetail:
    """One index: its rules-as-data + latest-composition summary."""
    d = await session.get(IndexDefinition, index_id)
    if d is None:
        raise IndexNotFound(index_id)
    s = (await _summaries(session, date.today())).get(index_id, {})
    return IndexDetail(
        index_id=d.index_id, title=d.title, description=d.description, family=d.family,
        universe=d.universe, currency=d.currency, cap_scheme=d.cap_scheme,
        commercial_ok=d.commercial_ok, attribution=d.attribution,
        latest_rebalance=s.get("rebalance_date"), latest_vintage=s.get("vintage_date"),
        n_eligible=s.get("n_eligible", 0), n_excluded=s.get("n_excluded", 0),
        methodology_note=d.methodology_note, doc_version=d.doc_version,
        rules=IndexRulesOut(
            income_ceiling_usd=d.income_ceiling_usd, min_face_usd_mn=d.min_face_usd_mn,
            min_maturity_years=d.min_maturity_years, exit_maturity_months=d.exit_maturity_months,
            cap_scheme=d.cap_scheme, cap_pct=d.cap_pct, rebalance_rule=d.rebalance_rule,
        ),
    )


@router.get("/{index_id}/composition", response_model=CompositionResponse, operation_id="get_index_composition")
async def get_index_composition(
    index_id: str,
    as_of: date | None = None,
    rebalance: date | None = None,
    session: AsyncSession = Depends(get_async_session),
) -> CompositionResponse:
    """The index composition AS KNOWN ON `as_of` (default today): every constituent with its raw and
    capped weight and its eligibility reason. `rebalance` pins a specific month; otherwise the latest."""
    as_of = as_of or date.today()
    d = await session.get(IndexDefinition, index_id)
    if d is None:
        raise IndexNotFound(index_id)
    rows = (
        await session.execute(
            _COMPOSITION_PIT, {"index_id": index_id, "as_of": as_of, "rebalance": rebalance}
        )
    ).all()
    if not rows:
        raise IndexDataNotFound(index_id, as_of)
    constituents = [
        ConstituentOut(
            constituent_id=r.constituent_id, constituent_name=r.constituent_name, cid=r.cid,
            face_amount=r.face_amount, raw_weight=r.raw_weight, capped_weight=r.capped_weight,
            eligible=r.eligible, eligibility_reason=r.eligibility_reason,
        )
        for r in rows
    ]
    return CompositionResponse(
        index_id=index_id, as_of=as_of,
        rebalance_date=rows[0].rebalance_date, vintage_date=rows[0].vintage_date,
        commercial_ok=d.commercial_ok, attribution=d.attribution,
        n_eligible=sum(1 for c in constituents if c.eligible),
        n_excluded=sum(1 for c in constituents if not c.eligible),
        constituents=constituents,
    )


@router.get("/{index_id}/changes", response_model=ChangesResponse, operation_id="get_index_changes")
async def get_index_changes(
    index_id: str,
    as_of: date | None = None,
    session: AsyncSession = Depends(get_async_session),
) -> ChangesResponse:
    """What changed between the two most recent rebalances (as known on `as_of`): countries/securities
    added, dropped, or re-weighted. Empty until an index has at least two rebalances stored."""
    as_of = as_of or date.today()
    d = await session.get(IndexDefinition, index_id)
    if d is None:
        raise IndexNotFound(index_id)
    # The two most recent rebalance_dates that have a vintage <= as_of.
    rbs = (
        await session.execute(
            text(
                """
                SELECT DISTINCT rebalance_date FROM indexcomposition
                WHERE index_id = :i AND vintage_date <= :a
                ORDER BY rebalance_date DESC LIMIT 2
                """
            ),
            {"i": index_id, "a": as_of},
        )
    ).all()
    if len(rbs) < 2:
        return ChangesResponse(index_id=index_id, from_rebalance=None, to_rebalance=None, changes=[])
    to_rb, from_rb = rbs[0].rebalance_date, rbs[1].rebalance_date

    async def _eligible_weights(rb: date) -> dict[str, tuple[str, float]]:
        rows = (
            await session.execute(_COMPOSITION_PIT, {"index_id": index_id, "as_of": as_of, "rebalance": rb})
        ).all()
        return {r.constituent_id: (r.constituent_name, r.capped_weight) for r in rows if r.eligible}

    old = await _eligible_weights(from_rb)
    new = await _eligible_weights(to_rb)
    changes: list[IndexChange] = []
    for cid in sorted(new.keys() - old.keys()):
        changes.append(IndexChange(constituent_id=cid, constituent_name=new[cid][0], kind="added",
                                   old_weight=None, new_weight=new[cid][1]))
    for cid in sorted(old.keys() - new.keys()):
        changes.append(IndexChange(constituent_id=cid, constituent_name=old[cid][0], kind="dropped",
                                   old_weight=old[cid][1], new_weight=None))
    for cid in sorted(old.keys() & new.keys()):
        if abs(old[cid][1] - new[cid][1]) > 1e-9:
            changes.append(IndexChange(constituent_id=cid, constituent_name=new[cid][0], kind="reweighted",
                                       old_weight=old[cid][1], new_weight=new[cid][1]))
    return ChangesResponse(index_id=index_id, from_rebalance=from_rb, to_rebalance=to_rb, changes=changes)
