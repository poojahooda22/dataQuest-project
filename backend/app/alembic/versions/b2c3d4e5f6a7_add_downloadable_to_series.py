"""add downloadable to series

Additive Phase-2a (licence honesty): a `downloadable` REDISTRIBUTION gate on Series, distinct from
`commercial_ok` (the DISPLAY verdict). Default False via server_default so existing rows are safe on the
add; the worker re-seeds the real per-source verdicts (`_LICENSE` in registry.py). Safe mid-deploy — the
old client ignores the new column.

Revision ID: b2c3d4e5f6a7
Revises: f7a8b9c0d1e2
Create Date: 2026-07-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "f7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "series",
        sa.Column("downloadable", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("series", "downloadable")
