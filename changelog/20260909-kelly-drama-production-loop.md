# Kelly Drama production-loop reliability

- Added runtime capability detection for media tools and generation providers without exposing credentials.
- Connected AirApp generation requests to Buda's confirmation-gated App-to-Agent action protocol.
- Added visible queued/running/generated/blocked states and actionable generation errors.
- Added a reproducible episode rough-cut renderer with SRT output, still-image fallback, Busabase upload, and episode indexing.
- Added pre-upload enforcement of Busabase's 25 MB Asset limit with automatic video proxy encoding.
- Added inline episode playback and idle-safe refresh after background generation completes.
- Added OpenAI-compatible API TTS as a cross-platform alternative to Qwen3-TTS MLX.
