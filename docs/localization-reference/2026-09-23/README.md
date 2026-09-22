# Bokuno localization: opcode and runtime-text reference

Supplement dated 2026-09-23 for [issue #1](https://github.com/beck4679-alt/bokuno-rs3-ko/issues/1), containing the three requested modules plus their two local dependency modules, copied from my current working sources (five source files in total).

[Download ZIP](bokuno-localization-opcode-reference-20260923.zip) · [Browse source](source/BOKUNO_COMPAT_VM_PROJECT/tools/) · [File manifest](MANIFEST.json) · [ZIP checksum](SHA256SUMS)

This supplements the [seven-file reference from 2026-09-21](../2026-09-21/README.md). It contains source code and documentation only. The source files are byte-for-byte copies; the original working files were not changed.

## Files

| File | Role |
|---|---|
| [rs3_native_ops_v30.mjs](source/BOKUNO_COMPAT_VM_PROJECT/tools/rs3_native_ops_v30.mjs) | Native opcode lengths, text/control classification, operand decoding, and event lookup wrappers. |
| [rs3_runtime_text_v30.mjs](source/BOKUNO_COMPAT_VM_PROJECT/tools/rs3_runtime_text_v30.mjs) | Actor/item/table names, WRAM-backed text and numbers, native glyph-slot decoding, and explicit unresolved-state/width-assumption records. |
| [rs3_static_conditions_v32.mjs](source/BOKUNO_COMPAT_VM_PROJECT/tools/rs3_static_conditions_v32.mjs) | Four-bit flag-domain splitting, post-gate successors, random-event alternatives, and selection-call continuations. |
| [rs3_event_identity_v30.mjs](source/BOKUNO_COMPAT_VM_PROJECT/tools/rs3_event_identity_v30.mjs) | Native event pointer lookup and conversion between tool catalog IDs and native event IDs. |
| [rs3_rom_guard_v32r2.mjs](source/BOKUNO_COMPAT_VM_PROJECT/tools/rs3_rom_guard_v32r2.mjs) | Exact ROM-size and SHA-256 identity checks used by the other modules. |

## Details relevant to a conservative checker

- `opLenAt` is the implemented length rule; some introductory comments are historical. For example, opcode `48` uses `3 + Math.max(1, count)`, so a zero count still consumes one inline data byte. `3C FF` is three bytes; the ordinary `3C` form is four.
- `0D 20` has a state-dependent length and deliberately returns `null` here. Unknown `4F` subcommands need a known supplied length or also return `null`. An unknown token is not evidence of a safe one-byte instruction.
- `gateSuccessor` models the post-gate step: for `33`, `34`, and `45`, a next byte below `0C` causes the following pair to tail-dispatch in the current VM frame. This applies after either gate outcome. `0D` and `49` gates do not use that inline-dispatch rule. The caller must calculate the selected successor first; see the previously shared walker for predicate decoding, state updates, and failure-skip handling.
- `3A` takes an offset into WRAM `EF00`, not a literal item ID. Runtime-text results can carry `assumptions` even when `complete` is true: a widest-name or maximum-digit substitute is a layout estimate, not an observed runtime value. Keep those cases separate from exact resolution in a control checker.
- Event operands use native IDs. The tool catalog's `0Fxx` aliases native `4Cxx`; it must not be substituted for a native `0Fxx` operand.

## Dependencies and scope

All relative JavaScript imports used by these five modules are now included in the same tools directory. Their dependency chain is:

- `rs3_native_ops_v30.mjs` imports `rs3_event_identity_v30.mjs`.
- `rs3_runtime_text_v30.mjs` imports `rs3_rom_guard_v32r2.mjs` and uses the Node.js built-in `node:crypto` module.
- `rs3_event_identity_v30.mjs` imports `rs3_rom_guard_v32r2.mjs`; both use the Node.js built-in `node:crypto` module.
- `rs3_static_conditions_v32.mjs` has no imports, but its event helpers expect a supplied object with `rangeOfNative` (the native-ops wrapper provides it).

This remains a source reference rather than a full build kit. The ROM guard retains the project's exact accepted hashes, including historical candidates; a matching hash is not a claim of gameplay coverage. A newly built Chinese ROM will need its own verified identity policy.

The runtime-text model additionally needs the matching ROM, a glyph assignment, and relevant state/scratch values. ROM/table addresses and identity checks are specific to our tooling; adapting them requires verifying the target ROM layout. The models retain unhandled or approximated cases and do not constitute a complete emulator specification. They do not establish that the five helper fragments mentioned in the issue are resolved; their exact IDs/call sites are needed to compare those paths.

Publication checks cover unchanged source hashes, JavaScript syntax, loading the five modules together with Node.js, and ZIP integrity. No new ROM build or gameplay test was performed for this upload. No ROMs, translations, fonts, save states, or emulator binaries are included.

The project was developed with AI assistance, and this documentation/package was prepared with AI assistance as well.
