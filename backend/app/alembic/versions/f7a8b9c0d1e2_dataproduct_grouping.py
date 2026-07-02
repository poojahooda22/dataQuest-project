"""dataproduct grouping + faceted catalog

Additive Phase-1 (the Fusion-style Catalog feature): a DataProduct grouping layer + a nullable
Series.product_id FK + facet indexes for server-side filtering. Safe mid-deploy: the old client
ignores the new table/column; product_id is NULL on existing rows until the worker re-seeds. No
observation backfill (this is catalog metadata only).

Revision ID: f7a8b9c0d1e2
Revises: e1f2a3b4c5d6
Create Date: 2026-07-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dataproduct",
        sa.Column("product_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("title", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("theme", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("product_id"),
    )
    # Nullable FK -> safe to add to a populated table; existing rows are NULL until the worker re-seeds.
    op.add_column("series", sa.Column("product_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.create_foreign_key("fk_series_product_id", "series", "dataproduct", ["product_id"], ["product_id"])
    # Facet indexes: the columns server-side catalog filtering joins/filters on.
    op.create_index("ix_series_product_id", "series", ["product_id"], unique=False)
    op.create_index("ix_series_cid", "series", ["cid"], unique=False)
    op.create_index("ix_series_source", "series", ["source"], unique=False)
    op.create_index("ix_series_frequency", "series", ["frequency"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_series_frequency", table_name="series")
    op.drop_index("ix_series_source", table_name="series")
    op.drop_index("ix_series_cid", table_name="series")
    op.drop_index("ix_series_product_id", table_name="series")
    op.drop_constraint("fk_series_product_id", "series", type_="foreignkey")
    op.drop_column("series", "product_id")
    op.drop_table("dataproduct")