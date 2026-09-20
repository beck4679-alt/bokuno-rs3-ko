# Bokuno localization: seven core implementation files

Source reference snapshot, 2026-09-21, shared for [issue #1](https://github.com/beck4679-alt/bokuno-rs3-ko/issues/1).

[Download ZIP](bokuno-localization-source-reference-20260921.zip) · [Browse source](source/BOKUNO_COMPAT_VM_PROJECT/) · [Manifest and omitted imports](MANIFEST.json) · [ZIP SHA-256](SHA256SUMS)

I used AI assistance during development and translation/review work. This explanation and source package were also prepared with AI assistance.

This package contains **seven core source files** for studying the implementation. Helper/validation modules and project data are not bundled, so the ZIP is **not a standalone build kit**. No ROM, save state, font artwork, translation corpus, or emulator core is included. No new game build or patch release was made for this upload.

## Start here

| File | Role |
|---|---|
| [static_state_walker_v32.mjs](source/BOKUNO_COMPAT_VM_PROJECT/tools/static_state_walker_v32.mjs) | Walk event bytecode with protagonist/flag state, calls, returns, branches, shared fragments, and text assembly. |
| [rs3_candidate_stream_v32.mjs](source/BOKUNO_COMPAT_VM_PROJECT/tools/rs3_candidate_stream_v32.mjs) | Read the actual built ROM stream, including patched redirections. |
| [rs3_shadow_dispatch_v30.mjs](source/BOKUNO_COMPAT_VM_PROJECT/tools/rs3_shadow_dispatch_v30.mjs) | Read the ROM's source-address-to-payload directory and model which reader entries can trigger it. |
| [build_halfcell_julian_v1.mjs](source/BOKUNO_COMPAT_VM_PROJECT/tools/build_halfcell_julian_v1.mjs) | Assign character codes, pack text, allocate arenas, and generate writes/metadata. Search for `FULLSHADOW`, `shadowRows`, `codeOfN`, and `computeRegions`. |
| [build_julian_rom_v1.mjs](source/BOKUNO_COMPAT_VM_PROJECT/tools/build_julian_rom_v1.mjs) | Install text/font writes and assembly hooks. Search for `shadowPrelude`, `S_disp`, `S_back`, and region checks. |
| [utterance_compiler_v2.mjs](source/BOKUNO_COMPAT_VM_PROJECT/tools/utterance_compiler_v2.mjs) | Compile dialogue replacements using path and calling-context information. |
| [build_runtime_font_from_original_bmp_v1.py](source/BOKUNO_COMPAT_VM_PROJECT/runtime/build_runtime_font_from_original_bmp_v1.py) | Convert an 8x16 bitmap atlas to SNES planar 2bpp font data. |

The historical `julian` filenames remain, but the builders were extended beyond that initial route. Some source comments describe earlier iterations; consult the current implementation and guards when adapting it.

## Walker and builder

Bokuno often assembles dialogue from shared fragments, dynamic names, calls, and conditional branches. The walker reads ROM bytecode and tracks relevant state to reconstruct those dialogue paths and source addresses. After a build it decodes the bytes actually stored in the candidate ROM, rather than using intended ledger text as the result.

The builder takes translation inputs, assigns glyph codes, allocates translated payloads, and generates the address tables, return targets, and assembly patches. A context dispatcher can select different translations for a shared fragment according to relevant calling contexts and protagonist conditions.

The workflow is:

```text
ROM -> walker/context reconstruction -> translation data -> builder
    -> read the built ROM again -> emulator checks
```

The walker is static analysis, with bounded exploration and unresolved cases. It is not CPU/PPU emulation or proof of full natural gameplay coverage. The full project uses separate emulator checks for rendering and event execution; those tools are outside this small package.

## How dialogue expansion works

The builder places translated text in separately allocated ROM regions called text arenas. It distinguishes the original source address, the translated payload address, and the continuation address.

**Shadow redirection:** hooks in supported text-reader entry points look up the current original ROM address in a generated directory. A matching entry redirects the script cursor to the translated payload. The directory is grouped by source bank and contains sorted source keys and destination pointers. At the end of the payload, the reader resumes at the appropriate original continuation.

This does not require putting a jump inside the original fragment. Even an eligible one- or two-byte original fragment can therefore have a longer translation, while surrounding event addresses stay in place. Some special readers bypass these hooks and require separate handling.

**Direct OUT/BACK redirection:** where supported and there is enough source space, `FE lo hi` is a three-byte jump to an arena. A source-bank table supplies the destination bank. `FF lo hi bank` at the end of the translated payload supplies the full continuation address.

```text
original event -> translated payload in an arena -> original continuation
```

These custom operations are enabled only in registered ROM ranges. Arena coverage and return targets must be correct: matching bytes elsewhere must not accidentally be treated as jumps.

The mechanism removes the original fragment's byte budget for supported replacement paths. Available ROM space, encoding capacity, and text-window layout remain constraints. The input is an already-expanded Bokuno ROM; this is not a claim that the package expands a stock RS3 ROM's file size.

## Font

The Korean font uses precomposed 8x16 Hangul syllable bitmaps. The converter reads a KS X 1001 set of 2,350 syllables plus ASCII and outputs planar 2bpp data; the builder assigns glyphs used by the translation to game slots. Text uses one-byte and two-byte character codes, with reserved slots and reader-specific restrictions. Dialogue rendering is patched for an 8-pixel Korean advance.

Menus, battle text, and mass-combat messages use different reading/rendering paths. A Chinese localization needs its own character inventory, font, slot allocation, and layout decisions; the Korean allocation is not a ready-made Chinese character set.

## Dependencies and publication changes

The original scripts reference a matching Bokuno ROM, route configuration, encoding tables, translation ledgers, runtime JSON declarations, generated output metadata, font atlas/cell map, helper modules, and external emulator tools. These are not in this ZIP. The manifest enumerates omitted literal relative JavaScript imports; it is not an exhaustive list of dynamically loaded code and data. Node.js is used for the JavaScript tools and Python/Pillow for the font converter.

The font converter keeps its project-relative source atlas/cell-map paths to show its expected input contract. ROM identity guards and opcode/layout assumptions also remain. Porting to a different ROM version requires checking those assumptions, not just disabling guards. Some historical candidate outputs referenced by the source are not available in this package.

Only publication copies were changed: UTF-8/LF normalization and escaping one literal NUL inside a JavaScript string as `\x00` with the same string value. The local working sources were left untouched. `MANIFEST.json` records original and published SHA-256 values.

The publication checks cover JavaScript syntax, Python syntax, source-copy hashes, and ZIP integrity. They do not constitute a new full build or gameplay validation of this reference package.
