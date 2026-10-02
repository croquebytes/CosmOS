# assets/audio — what is installed, and how it was made

Drop-in audio for `js/audiofiles.js` (contract: `docs/AUDIO_PLAN.md` §5). A file
here is optional: with it absent the game behaves exactly as it did without it.

## Naming

| Kind | File | Example |
|---|---|---|
| Music | `music__<id>.ogg` + `.mp3` | `music__primordial-shift.ogg` |
| Voice | `vo__<speaker>__<line-id>.ogg` + `.mp3` | `vo__instructor__t1-s2-0.ogg` |
| Foley | `sfx__<cue>.ogg` + `.mp3` | `sfx__purchase.ogg` |

- **Music ids** are the keys of `AudioFiles.MUSIC`: `primordial-shift` (M1),
  `void-breach` (M2), `cascade` (M3), `release-day` (M4), `fates-table` (M5),
  `media-player` (M6), `mirror-login` (M7), `ending-hostile` / `ending-curious` /
  `ending-complicit` (M8–M10), `boot` (M11). Every id is already wired; dropping
  its file in is all it takes.
- **Speakers** are `instructor` (caption speaker `I`), `null-operator` (`N` on
  the tapes, `ADV` in the scenes), `sys` (`S` on the tapes, `SYS` in the scenes)
  and `fate` (Patience.exe's dealer, and `HOST` in the scenes). One voice ID
  per speaker everywhere: the tape SYS and the scene SYS are the same voice.
- **Line ids**, by where the line lives. Every one is the content id the line
  already has, so the id names the line, not the words:

  | Where | Line id | Speaker | Example |
  |---|---|---|---|
  | Training tapes (`MediaCatalog.tapes`) | `<tape>-s<shot>-<caption>` | caption speaker | `vo__instructor__t1-s2-0` |
  | Fate at Patience.exe (`CasinoHostBarks`) | `CAS-HOST-<nnn>` | `fate` | `vo__fate__CAS-HOST-051` |
  | Mirror Login, SCN-ADV-001 (`AdversaryScene.dialogue`) | `ADV-<nnn>` | beat speaker | `vo__null-operator__ADV-010`, `vo__sys__ADV-001`, `vo__fate__ADV-027` |
  | End of Shift, SCN-ADV-002 (`AdversaryFinale`) | `FIN-…` | beat speaker | `vo__null-operator__FIN-H-01`, `vo__sys__FIN-H-03`, `vo__null-operator__FIN-R-C` |

  A tape line id is the tape id, the 1-based shot number (as in the shot
  code `T1-S2`) and the 0-based index of the caption within that shot.
  The choice prompt (`ADV-022`) is never spoken, and neither is a beat whose
  text carries a placeholder (`{REBOOTS}`, `{BAND}`: `ADV-011B`, `FIN-011`,
  `FIN-012`): its words change per save, and voice must say what the
  caption says. If a line is reworded, regenerate its file and update its
  text here. `tests/audio-files.mjs` fails when a tape caption and its row
  below disagree.
- **Foley** is named by the synth cue it layers on, verbatim: the keys of
  `audio.SOUNDS` (`purchase`, `windowOpen`, `document`, `ship`, ...). It
  plays through that cue's own voice at about −6 dB (`AudioFiles.FOLEY_GAIN`),
  rate-limited per cue. Master one-shots dry, peaking around −12 dBFS.
- `.ogg` (Opus) is preferred where the browser decodes it; `.mp3` is the fallback.
  Both are 48 kHz.

## What a file does when it lands

- **Tape lines** play at their caption, and the tape clock waits at the next
  caption until the line is done. Pausing mid-line and playing again says the
  line again from its start.
- **Fate** says the line her strip shows, when Dealer Chatter and Voices are
  on. Her lines already pass the router's cooldowns, so she is never heard
  more often than the strip changes. Her next line replaces her last one; she
  never talks over a tape or a scene, and closing the table stops her.
- **Scene beats** play when drawn. The beat's dwell timer waits for the line,
  then moves on 0.35 s after it ends. A click still moves the scene on.
  Escape cuts the line, then does what it always did. An act beat waits on
  its button, as before.
- **Foley** layers on its synth cue from the second play on (the first play
  probes for the file, and a sample is never started late).

## Music

### M1 — Primordial Shift: `music__primordial-shift`

| | |
|---|---|
| Generator | Krea `generate_audio`, `elevenlabs/music-v2`, `force_instrumental: true`, `music_length_ms: 150000` |
| Takes | 2. Take A (job `f159562c-b051-4698-870c-bf0be8a875b0`): LRA 4.8 LU, short-term level wandering −13.8 to −20 LUFS. **Take B (job `059f6297-4834-45b0-b452-fe67a07e9c54`), used**: LRA 1.6 LU, short-term −14.0 to −15.9 LUFS, lower spectral flux (fewer transients). Take B is the steadier bed for hours of idle play. |
| Loop | Take B from 24.2 s to 144.3 s (120.1 s). The points were picked by comparing 3-second chroma and band-energy windows at the start and end, so the end flows into material like the start. The first 4 s are equal-power crossfaded with the 4 s the take played after 144.3 s, so the wrap is the take's own continuation. A 1.68 dB gain ramp corrects the take's slow sag, so the seam doesn't step in level. |
| Master | Two-pass `loudnorm` (linear, plain gain) to −20 LUFS integrated |
| Files | `.ogg` Opus 96 kb/s VBR stereo, 120.11 s, −20.0 LUFS, peak −10.5 dBFS, 1.6 MB · `.mp3` LAME V4 stereo, 120.10 s, −20.0 LUFS, peak −10.7 dBFS, 1.9 MB |

Prompt (take B), the M1 row of the plan with the §1 style block:

> Primordial Shift: patient choir pad over a low organ pedal tone on D, a three-note bell motif every 20 seconds, warm and hopeful. Sacred minimalism, slow choral pads and pipe organ drones, sparse bell motifs in D major pentatonic, warm analog tape saturation, faint vinyl and tape hiss, 1990s PC sound card reverb, gentle bitcrush on reverb tails, contemplative, liturgical, unhurried, no drums, no epic trailer percussion, no vocals with words, seamless loop. Constant level throughout, begins and ends on the same sustained D drone so the end flows back into the start. Avoid: EDM, dubstep, trap beats, cinematic trailer hits, orchestral bombast, chiptune lead, autotune, pop vocals, lyrics, sudden loud transients.

Take A's prompt was the same without "on D" and the last sentence, which instead asked for "steady even dynamics from start to finish with no intro build and no ending fade".

## Voices

### The Instructor — tape T1

| | |
|---|---|
| Generator | Krea `generate_audio`, `elevenlabs/tts`, `model_id: eleven_v4` |
| Voice | **Eric, `cjVigY5qzO86Huf0OWal`.** Keep this voice for every Instructor line on every tape. |
| Direction | Warm, unhurried, deadpan 1994 HR-video presenter. Never in on the joke. The caption text was sent verbatim, with no tags. |
| Processing | Edge silence trimmed (−50 dB, keeping about 40 ms of air before the first word), 90 Hz high-pass, two-pole 7 kHz high-cut (the VHS band), a small generated room (0.4 s decaying, darkened noise impulse) mixed 0.22 under the dry signal, a 0.35 s tail pad, then two-pass linear `loudnorm` to −18 LUFS |
| Files | `.ogg` Opus 40 kb/s mono · `.mp3` 64 kb/s mono, 48 kHz |

| Line id | Duration | LUFS (ogg) | Text |
|---|---|---|---|
| `t1-s2-0` | 7.37 s | −18.2 | Good morning, Successor. This is the Universal Engine. It makes Praise, and Praise is what the universe runs on. |
| `t1-s2-1` | 4.82 s | −18.2 | The previous Operator left it in this condition. We will not be dwelling on that. |
| `t1-s3-0` | 7.50 s | −18.2 | Press Perform Miracle, or the Space bar. Each press is one Miracle, and each Miracle is paid in Praise. |
| `t1-s3-1` | 6.57 s | −18.2 | Press again within two and a half seconds and they chain into a Streak. A Streak pays more per press. |
| `t1-s4-0` | 5.77 s | −18.2 | Every Miracle also charges the Celestial Overclock. A longer Streak charges it faster. |
| `t1-s4-1` | 6.91 s | −18.2 | At one hundred charge, trigger it: thirty seconds of half again the production, and stronger Miracles. |
| `t1-s5-0` | 7.06 s | −18.3 | Praise is kept in a vault, and the vault has a ceiling. Sector 7G is currently running on half of one. |
| `t1-s5-1` | 7.10 s | −18.2 | When the readout says STORAGE FULL, further Praise is discarded. Standing Requisitions buy more vault. |
| `t1-s6-0` | 6.88 s | −18.1 | Your first Divine Directive is ten Miracles. Claim the reward, then spend ten Praise on a Seraph. |
| `t1-s6-1` | 3.18 s | −17.9 | That is the next tape. Please rewind this one. |

T1's one `S` caption (`t1-s1-0`, the copyright notice) is for the SYS voice and has
no file yet. It stays caption-only, and the tape doesn't wait on it.

Most lines run longer than the gap to the next caption, so with voices on, T1 plays
in about 68 s instead of 44 s: the tape clock holds each caption until its line is
done (`createTapeVoice` in `js/audiofiles.js`).

## Resuming generation

Krea's balance ran out after this batch. Nothing above needs regenerating. To go on,
follow `docs/AUDIO_PLAN.md` §6:

- **M4 Release Day** comes next: `elevenlabs/music-v2`, `force_instrumental: true`,
  about 20 s, the M4 row plus the §1 style block. It's a stinger: no loop trim, just
  −20 LUFS. Drop it in as `music__release-day.ogg` and `.mp3` and it rings with the
  `ship` cue.
- **The Instructor, T2–T5**: same model (`eleven_v4`), same voice
  (`cjVigY5qzO86Huf0OWal`), same processing. Name each file by its line id
  (`AudioFiles.tapeLines` lists them all).
- **The process**: master and encode with two-pass linear `loudnorm`, then Opus and
  MP3 at 48 kHz. Check with `ffprobe` and `ebur128`. Add a row above with the exact
  text, and run `npm run test:audio-files`.

### Next lines to generate (none generated yet)

Every hook below is wired and inert until its file lands. Generating any of
them costs credits, so it needs the user's approval of a quoted cost first.
In `docs/AUDIO_PLAN.md` §6 order:

1. **Fate's 12 lore whispers**: `vo__fate__CAS-HOST-051` to `-062`. Short,
   rare, high charm per second. Whisper them dry, and drop the `(whisper)`
   stage direction from the text sent.
2. **The Mirror Login, NULL.OPERATOR** (14 lines): `vo__null-operator__ADV-010`,
   `-011`, `-012`, `-014`, `-015`, `-016`, `-018`, `-019`, `-021`, `-023A`,
   `-023B`, `-023C`, `-024`, `-026`. Each holds its beat, so these set the
   scene's pace.
3. **The Mirror Login, SYS** (7 lines): `vo__sys__ADV-001`, `-002`, `-006`,
   `-007`, `-008`, `-009`, `-013`. Leave out the chrome beats `ADV-003` to
   `-005` (field labels and "…"). Then `-017`, `-020`, `-025`, `-028`, `-029`,
   and the T1 copyright notice `vo__sys__t1-s1-0`.
4. **The house, from far away**: `vo__fate__ADV-027`, then the finales'
   `FIN-H-08`, `FIN-C-08` and `FIN-X-08`, in Fate's voice.
5. **End of Shift**: `FIN-010`, the three re-entries `FIN-R-H/C/X`, then each
   ending's beats. Skip `FIN-011` and `FIN-012` (placeholders).
6. **Foley**, one-shots per §4: `sfx__windowOpen` / `sfx__windowClose`
   (relay clunks), `sfx__document` (drive seek), `sfx__ship` (rubber stamp).
   The coin on felt and the pneumatic tube have no synth cue of their own
   yet, so they wait for one.
