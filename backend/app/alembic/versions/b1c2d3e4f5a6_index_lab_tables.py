"""index lab tables — index definitions + composition panel

Additive (the Index Lab feature): two new tables for rules-based bond-index construction.
`indexdefinition` holds each index's construction rules AS DATA (version-stamped); `indexcomposition`
is the append-only, point-in-time panel of constituents + weights per rebalance per vintage — the same
vintage discipline as `observation`. Safe mid-deploy: both are NEW tables the old client ignores, and
nothing on existing tables is backfilled. Plain Postgres (no hypertable) — matches the macro-panel
decision; monthly cadence at ~5k rows/year needs no TimescaleDB feature.

Revision ID: b1c2d3e4f5a6
Revises: c3d4e5f6a7b8
Create Date: 2026-07-03
"""
from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The index RECIPE table: construction rules stored as data, version-stamped by `doc_version`.
    op.create_table(
        "indexdefinition",
        sa.Column("index_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("title", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("family", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("universe", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("currency", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("income_ceiling_usd", sa.Float(), nullable=True),   # NULL = no income screen
        sa.Column("min_face_usd_mn", sa.Float(), nullable=False),
        sa.Column("min_maturity_years", sa.Float(), nullable=False),
        sa.Column("exit_maturity_months", sa.Float(), nullable=False),
        sa.Column("cap_scheme", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("cap_pct", sa.Float(), nullable=True),              # NULL = pure ICA / uncapped
        sa.Column("rebalance_rule", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("methodology_note", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("doc_version", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("commercial_ok", sa.Boolean(), nullable=False),
        sa.Column("attribution", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("index_id"),
    )
    # The append-only COMPOSITION panel: constituents + weights per rebalance per vintage.
    op.create_table(
        "indexcomposition",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("index_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("rebalance_date", sa.Date(), nullable=False),
        sa.Column("vintage_date", sa.Date(), nullable=False),
        sa.Column("constituent_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("constituent_name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("cid", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("face_amount", sa.Float(), nullable=False),
        sa.Column("raw_weight", sa.Float(), nullable=False),
        sa.Column("capped_weight", sa.Float(), nullable=False),
        sa.Column("eligible", sa.Boolean(), nullable=False),
        sa.Column("eligibility_reason", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.ForeignKeyConstraint(["index_id"], ["indexdefinition.index_id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_indexcomposition_index_id"), "indexcomposition", ["index_id"], unique=False
    )
    # The point-in-time index (mirrors ix_obs_pit): leads with the index key, then the rebalance
    # period, then vintage_date DESC — so "composition as known on as_of" reads WITHOUT a Sort step.
    op.execute(
        "CREATE INDEX ix_idxcomp_pit ON indexcomposition "
        "(index_id, rebalance_date, vintage_date DESC)"
    )
    # Idempotent recompute: the same (index, rebalance, vintage, constituent) can never insert twice
    # -> the engine's INSERT ... ON CONFLICT DO NOTHING depends on this (append-only, never overwrite).
    op.create_unique_constraint(
        "uq_idxcomp_vintage",
        "indexcomposition",
        ["index_id", "rebalance_date", "vintage_date", "constituent_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_idxcomp_vintage", "indexcomposition", type_="unique")
    op.drop_index("ix_idxcomp_pit", table_name="indexcomposition")
    op.drop_index(op.f("ix_indexcomposition_index_id"), table_name="indexcomposition")
    op.drop_table("indexcomposition")
    op.drop_table("indexdefinition")
