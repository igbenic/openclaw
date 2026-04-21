---
name: kokoro-tts
description: Generate spoken audio from text using a self-hosted Kokoro TTS API. Use when the user asks you to say something out loud, send a voice reply, turn text into speech, or produce a spoken audio attachment from chat text.
metadata:
  {
    "openclaw":
      {
        "emoji": "🗣️",
        "requires": { "bins": ["node", "curl"], "env": ["KOKORO_API_URL"] },
        "primaryEnv": "KOKORO_API_URL",
        "install":
          [
            {
              "id": "curl",
              "kind": "brew",
              "formula": "curl",
              "bins": ["curl"],
              "label": "Install curl",
            },
          ],
      },
  }
---

# Kokoro TTS

Generate speech audio through the self-hosted Kokoro service.

## Config

Set `KOKORO_API_URL` to the speech endpoint. For the selfhosted-home deployment, prefer:

```bash
http://host.docker.internal:8880/v1/audio/speech
```

If OpenClaw runs on the host, this reaches the Docker service directly. If OpenClaw runs elsewhere, point it at the reachable Kokoro URL for that machine.

Optionally set:

- `KOKORO_DEFAULT_VOICE` (default voice id, fallback `af_heart`)
- `KOKORO_DEFAULT_SPEED` (fallback `1.0`)
- `KOKORO_OUTPUT_DIR` (default `./media`)

You can store these in the active OpenClaw config under `skills.entries.kokoro-tts.env`.

## Usage

```bash
node {baseDir}/scripts/tts.js "Hello from Kokoro"
node {baseDir}/scripts/tts.js "Hello from Kokoro" af_nova
node {baseDir}/scripts/tts.js "Hello from Kokoro" af_nova 1.1
```

The script writes an audio file and prints:

```text
[[audio_as_voice]]
MEDIA:relative/or/absolute/path.mp3
```

Use that output directly in your reply when the user wants spoken audio.

## Notes

- This skill assumes an OpenAI-style speech endpoint at `KOKORO_API_URL`.
- Prefer short natural phrasing for voice replies instead of dumping huge paragraphs.
- If the API rejects `mp3`, the wrapper falls back to `wav` automatically.
- For voice choices, see `references/voices.md`.
