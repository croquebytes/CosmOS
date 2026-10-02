# CosmOS — Audio, Music and Narration Plan

**Written:** 2026-10-01. A companion to `docs/VISUAL_UPGRADE_PLAN.md`. Every asset here can be
generated: with Krea's audio models (ElevenLabs TTS / Music, Seed Audio), or any generator
that exports the formats below.

The game already has a **fully synthesised** sound layer (`js/audio.js`): about 25 UI and
event cues, an ambient drone that reacts to production and cascade, and buses with a
limiter. **That layer stays.** It is the OS's own voice. Generated audio adds three
things the synth cannot do: **music**, **voices**, and **recorded texture**. It must
arrive the way the video does: by drop-in file, inert until the file exists.

---

## 1. Sound direction (paste-ready)

**One line:** *A cathedral organ running on a 1996 sound card.* Sacred and choral, heard
through cheap hardware: tape hiss, PC-speaker edges, a little bitcrush on the reverb
tail. It is never epic-trailer and never chiptune.

**Style block for music prompts**

```
sacred minimalism, slow choral pads and pipe organ drones, sparse bell motifs in D major
pentatonic, warm analog tape saturation, faint vinyl and tape hiss, 1990s PC sound card
reverb, gentle bitcrush on reverb tails, contemplative, liturgical, unhurried, no drums,
no epic trailer percussion, no vocals with words, seamless loop
```

**Negative**

```
EDM, dubstep, trap beats, cinematic trailer hits, orchestral bombast, chiptune lead,
autotune, pop vocals, lyrics, sudden loud transients
```

**Rules**

1. **Key and scale.** D major pentatonic, matching the synthesised Miracle bell
   (`js/audio.js`). Music in that key makes every click land in harmony.
2. **Under the cues.** Music sits about 12 dB below the SFX bus. Players will idle for
   hours, so nothing may fatigue: no hooks that nag, no loud transients.
3. **Loops are seamless.** 2–4 minute beds, with the first and last bars matched. Export
   with a 2 s tail trimmed.
4. **Voices are diegetic.** Narration comes *from* something in the world (a training
   tape, a terminal, a dealer), so it gets that thing's processing (tape EQ, phone band,
   room). Never use a clean announcer voice.
5. **Words stay in the captions too.** Every spoken line already exists as on-screen
   text. Voice is an enhancement, never the only carrier, so a muted player misses
   nothing.

---

## 2. Music

| Id | Cue | Plays | Length | Prompt (+ style block) |
|---|---|---|---|---|
| M1 | **Primordial Shift** | Desktop, primordial dimension (default bed) | 3–4 min loop | patient choir pad over a low organ pedal tone, a three-note bell motif every 20 seconds, warm and hopeful |
| M2 | **Void Breach** | While the Void dimension is open | 3 min loop | the same motif inverted and detuned, sub-bass drone, reversed choir swells, ichor-dark, uneasy but not horror |
| M3 | **Cascade** | Layered over the bed at cascade tier 2 and above | 90 s loop | dissonant cluster swelling and receding, clock-like ticking from a broken relay, tension that never resolves |
| M4 | **Release Day** | Release notes after a ship | 20 s stinger | full choir major chord blooming out of tape hiss, a single bell on the downbeat, a sense of a fresh start |
| M5 | **Fate's Table** | Patience.exe window focused | 2 min loop | lounge jazz played on a church organ, brushed snare *allowed here only*, smoky, sly, a music-box countermelody |
| M6 | **Media Player** | Sacred Media Player idle menu | 60 s loop | corporate training-video library music from 1994, cheerful synth pad and marimba, slightly warped tape |
| M7 | **Mirror Login** | Adversary scene | 2 min loop | the M1 motif played backwards and half a beat late, sparse, cold digital reverb |
| M8–M10 | **Endings** (hostile, curious, complicit) | Each ending's credits roll | 60–90 s each | hostile: the motif resolved, alone, a single organ; curious: two interleaved voices of the motif in canon; complicit: the motif handed to a distant choir, fading under tape hiss |
| M11 | **Boot** | First launch, under V1 | 8 s | BIOS beep into a rising choir chord, hard-stops on the desktop |

**Generator settings.** ElevenLabs Music with `force_instrumental: true`, length as above.
Generate 2–3 takes of each, then pick and loop-trim in an editor.

---

## 3. Narration and voices

Every line is already written in the content tables. These are the voices to cast.

| Voice | Who | Lines (source) | Direction | Processing |
|---|---|---|---|---|
| **The Instructor** | Archangel HR trainer | Training-tape captions with speaker `I` in `js/media.js` (≈50 lines, T1–T5) | warm, unhurried, deadpan corporate cheer, a 1994 HR video presenter; never in on the joke | VHS: high-cut at 7 kHz, slight wow and flutter, room reverb |
| **NULL.OPERATOR** | the adversary, *your own* voice gone wrong | speaker `N` in the tapes; ADV lines (`AdversaryScene`, ADV barks); finale beats (`AdversaryFinale`) | calm, intimate, a little too close to the mic; the same timbre as the Operator but flatter | dry, close, a ~30 ms doubled ghost track, occasional bitcrush on consonants |
| **Fate** | the casino host | `CasinoHostBarks` (84 lines) | velvet, amused, a lounge dealer who has seen every hand; whispers for the `rare` lines | small-club room, a touch of 78-rpm crackle; whispers dry |
| **SYS** | the OS itself | speaker `S` system notices, the SEV-1 alarm text, BIOS | robotic and polite, mid-90s text-to-speech on purpose | telephone band, 8-bit at 11 kHz |
| **Mortal prayers / Choir posters** | many | Mail forwarded prayers; Choir posts (optional) | varied, short, read like voicemail | voicemail band, light noise |

**Generator settings.** ElevenLabs TTS through Krea `generate_audio` with model
`elevenlabs/tts` and `model_id: eleven_v4` for expression. Keep one fixed voice ID per
character. Generate one line per file and name it by the line's content id, so a reworded
line simply needs its file regenerated.

---

## 4. Recorded texture (optional)

These layer under the synth cues; they don't replace them. One-shots of 0.2–2 s:

- relay clunks for window open and close
- a hard-drive seek for documents
- a coin-on-felt for a Patience deal
- a page turn for Notepad
- a rubber stamp for SHIPPED / PATCHED
- a pneumatic-tube thunk for new mail
- the hum of a CRT degauss for the Void

Prompt them as foley, for example: *"close-mic foley, single brass rubber stamp pressed
onto thick paper on a wooden desk, dry"*.

---

## 5. Drop-in contract (built, mirroring §7 of the visual plan)

Wired in `js/audiofiles.js` (names, the bed choice, the tape narration sync) and
`js/audio.js` (the `music` and `voice` buses, probing, decoding, ducking). What is
installed, and exactly how it was generated, is in `assets/audio/MANIFEST.md`.
Tests: `tests/audio-files.mjs` (node) and `tests/audio.mjs` (browser).

- **Tape line ids:** `<tape>-s<shot>-<caption>`, e.g. `t1-s2-0`: the tape id, the
  1-based shot number (as in the shot code `T1-S2`), the 0-based caption index in
  that shot. Speakers `I` / `N` / `S` are the slugs `instructor` / `null-operator` /
  `sys`. Every M-cue in §2 already has its hook: beds follow the screen (an ending
  or the Adversary scene is exclusive, a window theme falls back to the dimension's
  bed, and M1 is the primordial bed only), M3 layers at cascade tier 2 and above,
  and M4 and M11 ring with the `ship` and `boot` synth cues.
- **Every other line id is the line's own content id**, under the speaker its row
  declares (`AudioFiles.fateLine`, `AudioFiles.sceneLine`):

  | Lines | Id | Speaker slug | File |
  |---|---|---|---|
  | Fate at Patience.exe (`CasinoHostBarks`) | `CAS-HOST-001` … `-084` | `fate` | `vo__fate__CAS-HOST-051` |
  | Mirror Login, SCN-ADV-001 | `ADV-001` … `ADV-029` | `ADV` → `null-operator`, `SYS` → `sys`, `HOST` → `fate` | `vo__null-operator__ADV-010`, `vo__sys__ADV-001`, `vo__fate__ADV-027` |
  | End of Shift, SCN-ADV-002 | `FIN-001`, `FIN-R-H`, `FIN-H-01` … | the same three | `vo__sys__FIN-H-03` |

  The choice prompt `ADV-022` is never spoken, and neither is a beat with a
  `{REBOOTS}` or `{BAND}` placeholder (`ADV-011B`, `FIN-011`, `FIN-012`): its words
  change per save, and a voice must say what the caption says.
- **Foley ids** are the synth cue names, verbatim (`audio.SOUNDS`): `sfx__purchase`,
  `sfx__windowOpen`. A foley file layers on its cue through that cue's own voice at
  `AudioFiles.FOLEY_GAIN` (about −6 dB), rate-limited per cue at the cue's repeat
  gap and never tighter than 120 ms. Master one-shots dry, around −12 dBFS peak.

- **Folder:** `assets/audio/`, which Vite already copies under `assets/`.
- **Formats:** `.ogg` (Opus or Vorbis) preferred, `.mp3` as the fallback, 48 kHz. Music
  at about −20 LUFS integrated; voice at about −18 LUFS.
- **Names:**
  - `music__<id>.ogg`, e.g. `music__primordial-shift.ogg`
  - `vo__<speaker>__<line-id>.ogg`, e.g. `vo__instructor__t1-s2-0.ogg` and `vo__fate__CAS-HOST-001.ogg`
  - `sfx__<name>.ogg`, layered on the synth cue of the same name
- **Loading:** probe with HEAD and require an audio content type, because Vite answers a
  missing file with `index.html` and status 200 (see `MediaLogic.responseIsMedia`).
  Decode lazily on first use, and cache.
- **Buses:** music gets a new `music` bus under master; voice gets a `voice` bus with
  ducking that drops music about 8 dB while a line plays. Both follow the existing
  mute and volume settings, plus new Music and Voice sliders in Divine Settings.
- **Narration sync** (built: `createTapeVoice`, `createSceneVoice` and
  `createFateVoice` in `js/audiofiles.js`):
  - Training tapes: a caption with a `vo` file plays it at the caption's timestamp,
    and the tape clock waits for the line to finish. Pausing mid-line (or hiding
    the tab) and playing again says the line again from its start; a seek forgets it.
  - Fate's strip: the line the strip shows is spoken, when Dealer Chatter and
    Voices are on. It has already passed the router's cooldowns. Her next line
    replaces her last; she never talks over a tape or a scene; closing the table,
    or turning chatter off, stops her line.
  - The Adversary scenes: a beat's line plays when the beat is drawn, and the
    beat's dwell timer waits for it, moving on 0.35 s after it ends. A click still
    moves on. Escape cuts the line, then does what it always did (skip to the
    choice, draw the transcript, file the record). An act beat waits on its button
    alone. Closing a scene, or reaching the release notes, cuts its line.
  - A line holds anything only once its file is known to be installed: a missing
    file, or a probe still out, never waits. With no file present, nothing changes.
- **Accessibility:** captions always stay on. A "Voices: on / off" setting is separate
  from music.
- **Tests:** follow the `tests/media.mjs` pattern. Missing files are inert, ducking
  restores, mute zeroes everything, and a sync caption waits for its line.
  `tests/audio.mjs` routes stand-in tones (generated with ffmpeg at run time, never
  committed) to prove Fate, the scenes and foley in a browser.
- **Next to generate:** the ordered list is in `assets/audio/MANIFEST.md`
  ("Next lines to generate"). Nothing there has been generated.

## 6. Production order

1. **M1 Primordial Shift** — heard most, sets the tone. Then **M4 Release Day**.
2. **The Instructor, tape T1** — 8 lines; proves the VO pipeline end to end.
3. **Fate's 12 lore whispers** — short, high charm per second.
4. **M5 Fate's Table**, **M2 Void Breach**, **M3 Cascade**.
5. **NULL.OPERATOR**: the Mirror Login, then the finales and **M7 to M10**.
6. **The remaining tapes, Fate lines, and texture foley.**
