# Training

Offline scripts and notebooks that build model artifacts. This code is **not**
shipped with the serving container.

Convention:

- One entry point per model, e.g. `train_categoriser.py`, writing artifacts to
  `../models/`.
- Keep notebooks for exploration; move anything reproducible into a script.
- The serving layer (`app/`) only *loads* artifacts from `models/` — it never
  trains.
