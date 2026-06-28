"""pit index + unique

Revision ID: cbe7eea462c6
Revises: 4e6342c11a19
Create Date: 2026-06-26 01:09:38.074393

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'cbe7eea462c6'
down_revision: Union[str, Sequence[str], None] = '4e6342c11a19'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # The point-in-time index (R70 FIX #1): leads with the series key, then the
    # period, then vintage_date DESC, so the PIT DISTINCT ON query is satisfied
    # WITHOUT a Sort step. Canonical DDL: 00-backend-research-and-plan.md.
    op.execute(
        "CREATE INDEX ix_obs_pit ON observation "
        "(series_id, observation_date, vintage_date DESC)"
    )
    # Idempotent ingest: the same (series, period, vintage) can never be inserted
    # twice -> the loader's INSERT ... ON CONFLICT DO NOTHING depends on this.
    op.create_unique_constraint(
        "uq_obs_vintage",
        "observation",
        ["series_id", "observation_date", "vintage_date"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("uq_obs_vintage", "observation", type_="unique")
    op.drop_index("ix_obs_pit", table_name="observation")
