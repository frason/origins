# Beta diagnostic export

Origins can export a versioned `.origins-diagnostic.json` file from the
Simulation controls. The download is generated locally and is not uploaded.

## Contents

- App, diagnostic-schema, and engine-save versions.
- World name, seed, and exact tick.
- A small ecosystem summary and event totals.
- Recorded interventions and the 100 most recent events.
- The complete versioned engine save, including constants, creatures, terrain,
  lineage evidence, and history.

The embedded engine save is the source of truth. Tests restore it exactly and
prove the next simulation tick matches the original run. A fixed world and
timestamp also serialize byte-for-byte identically.

## Privacy

The export contains simulation data only. It does not collect browser identity,
account identifiers, user-agent strings, URLs, local-storage contents, IP
addresses, or device details. Testers should still review a file before sharing
it because world names, interventions, and custom species names are included.

## Size and failure behavior

A seed-12345 world at tick 12 produces a compact 2,598,324-byte diagnostic. The
beta upload contract therefore allows up to 8 MiB; the earlier 2 MiB database
assumption was too small for the existing 100 by 100 world representation. A
representative tick-100 report is covered by a regression size gate.

If a browser cannot create the download, Origins shows a recoverable error in
the controls. The simulation and its local browser save are not modified.
