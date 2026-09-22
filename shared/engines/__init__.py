"""
BDA Engine Abstraction Package.
Provides dual execution modes:
- RENDER_LITE: Memory-bounded streaming batch aggregations, DuckDB query execution, and in-process stream simulation.
- FULL_BDA: Distributed Hadoop MapReduce, WebHDFS, Apache Hive, and Spark Streaming.
"""

import os
from enum import Enum


class BDAMode(str, Enum):
    RENDER_LITE = "RENDER_LITE"
    FULL_BDA = "FULL_BDA"


def get_bda_mode() -> BDAMode:
    mode_str = os.getenv("BDA_MODE", "RENDER_LITE").upper()
    try:
        return BDAMode(mode_str)
    except ValueError:
        return BDAMode.RENDER_LITE
