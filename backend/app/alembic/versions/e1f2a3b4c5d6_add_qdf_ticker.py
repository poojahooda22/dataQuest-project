"""add qdf_ticker to series

Additive, nullable column carrying the JPMaQS-grammar QDF ticker (cid_BASE_ADJUSTMENT). NULL = not
mapped. Safe mid-deploy: old client ignores the new column; no observation backfill (the /qdf route
derives the QDF view at read time).

Revision ID: e1f2a3b4c5d6
Revises: cbe7eea462c6
Create Date: 2026-06-30
"""
from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = "cbe7eea462c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("series", sa.Column("qdf_ticker", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    # A QDF ticker maps to exactly one series. Partial unique (NULLs allowed) so unmapped rows don't clash.
    op.create_index("ix_series_qdf_ticker", "series", ["qdf_ticker"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_series_qdf_ticker", table_name="series")
    op.drop_column("series", "qdf_ticker")