"""FinSight synthetic dataset generator for TSH Group (Phase 1).

Generates a clean, internally consistent AutoCount-shaped dataset for the 17
tables in `web/prisma/finsight_schema.sql`, plus a cleanly separated
`datagen` schema holding anomaly labels and run metadata.

Entry point: `python -m datagen`. See DATA_MODEL.md for how to read the data.
"""

PHASE = 1
