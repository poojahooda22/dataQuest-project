"""add unit to series

Additive, nullable column carrying the value's unit ("%", "index", "thousands of persons", ...) so the
data dictionary can state what the `value` field measures. NULL = unstated. Safe mid-deploy: old client
ignores the new column; no observation backfill.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-02
"""
from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("series", sa.Column("unit", sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade() -> None:
    op.drop_column("series", "unit")
