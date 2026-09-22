# ADR-003: Hadoop Streaming Architecture for MapReduce Jobs

## Status
Accepted

## Context
The BDA blueprint mandates Hadoop MapReduce jobs to compute Daily, Hourly, Monthly, and Peak Power aggregations. Java-only MapReduce jobs introduce heavy JVM compilation steps, while pure Python frameworks like mrjob can hide the underlying Hadoop Streaming mechanics needed for academic evaluation and production cluster operations.

## Decision
Implement native Hadoop Streaming jobs using pure Python standard I/O mappers and reducers (`jobs/mapreduce/`):
- `daily/mapper.py` & `reducer.py`: Keyed by Date, emits total kWh and sub-meter Wh.
- `hourly/mapper.py` & `reducer.py`: Keyed by Hour (0-23), produces 24-hour diurnal profile.
- `monthly/mapper.py` & `reducer.py`: Keyed by YYYY-MM, calculates seasonal trends.
- `peak/mapper.py` & `reducer.py`: Filters active power spikes $\ge \text{Threshold}$ and attributes appliance breakdown.

The universal runner (`jobs/mapreduce/runner.py`) detects if `hadoop` binary is available:
- If available: dispatches `hadoop jar hadoop-streaming.jar -mapper ... -reducer ...`
- If local: pipes mapper output through POSIX `sort` into reducer (`python mapper.py | sort | python reducer.py`).

## Consequences
- **Positive**: 100% compliant with real Hadoop Streaming clusters while fully executable locally without Java compilation friction. Guaranteed deterministic output.
- **Negative**: POSIX sort requires sufficient memory or disk buffer for huge multi-gigabyte datasets.
