# Credits

This project is built on other people's work. This file names it.

**None of the people or projects below endorse this tool, have reviewed it, or are responsible for
anything it gets wrong.** They are named because their work is what this rests on.

---

## Why this project is GPL-3.0

`src/lib/shiny/gen5.js` is a **port** of [PokeFinder](https://github.com/Admiral-Fish/PokeFinder) by
Admiral-Fish, which is GPL-3.0. Its own header lists the PokeFinder source files each algorithm and
constant came from (`Core/RNG/SHA1.cpp`, `Core/RNG/LCRNG64.hpp`, `Core/Gen5/Nazos.cpp`,
`Core/Gen5/Keypresses.cpp`, `Core/Util/Utilities.cpp`, commit `7adce35`).

That file is imported by `src/app/shiny-solution/page.tsx`, a client page, so it is **shipped to the
browser** — which is distribution, not merely running software on a server. Under GPL-3.0 that makes the
distributed work GPL-3.0, so **this project is licensed GPL-3.0-or-later** (see `LICENSE`).

This was not noticed when the port was written. It is fixed here rather than quietly.

## Software this project uses or derives from

| Project | By | Licence | What it gives us |
|---|---|---|---|
| [PokeFinder](https://github.com/Admiral-Fish/PokeFinder) | Admiral-Fish and contributors | GPL-3.0 | The entire Gen 5 engine (a port, see above). Also the frame convention, IV array order and empirical call positions that the Gen 3 and Gen 4 generators follow. |
| [PKHeX](https://github.com/kwsch/PKHeX) | Kurt (kwsch) and contributors | GPL-3.0 | The LCRNG reversal algorithm and the reverse-multiplier constants. |
| [pret](https://github.com/pret) | the pret project | see each repo | The disassemblies every structural claim is read from: pokered, pokeyellow, pokegold, pokecrystal, pokeruby, pokeemerald, pokefirered, pokeplatinum. Gen 2 and Gen 3 encounter tables come from these directly. |
| [gambatte-core](https://github.com/pokemon-speedrunning/gambatte-core) | the Pokemon Speedrunning project | see repo | The cycle-accurate Game Boy core every Gen 1 and Gen 2 derivation was measured on. |
| [mGBA](https://github.com/mgba-emu/mgba) | endrift and contributors | MPL-2.0 | The GBA core behind the Gen 3 frame measurements. |

## Timer programs the in-app cues stand in for

| Program | By |
|---|---|
| [EonTimer](https://github.com/DasAmpharos/EonTimer) | Toast++ (ToastPlusOne), 2010; ported and maintained by DasAmpharos |
| [FlowTimer](https://github.com/stringflow/FlowTimer) | stringflow |

These are the tools the community actually uses. Where a page offers a cue or a timer, it credits them
by name on the page itself.

## Community research

The **methodologies are the speedrunning communities', not ours.** Multi-step prescribed input sequences
for Gen 2 Trainer ID manipulation — buffered backouts, a measured wait, the New Game press held out rather
than tapped — were worked out over years and published in community route documents, script pastebins and
bruteforcers. What this project contributed is a derived table for that approach on specific game/console
pairs. That distinction is stated in the data files and rendered on the pages.

`src/lib/shiny/data/tid-sources.json` credits **104 named researchers and runners** for individual
published manipulations, each with a source link and the date it was verified. Those citations are
rendered beside the Trainer IDs they belong to.

### People who corrected this project directly

- **OceanBagel** — pointed out that the Gen 2 method did not reflect how these manipulations are actually
  performed: that they are prescribed sequences, that community inputs are buffered, and that the New Game
  press is held out rather than tapped for a few frames. The entire Gen 2 prescribed-sequence methodology
  exists because of that feedback and follows the shape it described.
- **ConstructiveCynicism** — identified that the Gen 3 pages did not say what they were for, that the
  Trainer ID is reseeded at the naming screen in Emerald and FireRed/LeafGreen, and that **encounter
  manipulation** is the Gen 3 RNG technique speedruns actually use. Their
  [FRLG-StarterTool](https://github.com/ConstructiveCynicism/FRLG-StarterTool) documents the
  FireRed/LeafGreen side. They offered their scanned tables; nothing here is copied from them, and they
  remain the right thing to check our own derivations against.
- **CasualPokePlayer** — established that Emerald and FireRed/LeafGreen are practically impossible to
  manipulate for TID/SID, and that Ruby/Sapphire pair manipulation does have Any% use. That is why
  Ruby/Sapphire is the family the Gen 3 work starts with.

## What is ours, and what is not verified

The derived tables in this repository are ours: the sweeps, the packing and the tooling. Every one of them
is **emulator-derived**. Unless a page says otherwise, **nothing here has been confirmed on real hardware,
and no human has executed the scripts it prints.** Each data file carries a `not_derived` block listing
exactly what has not been established, and the pages render it rather than hiding it.

## Pokémon

Pokémon and all related names are trademarks of Nintendo, Creatures Inc. and GAME FREAK Inc. This project
is an unofficial fan resource, is not affiliated with or endorsed by them, and contains no game assets.
