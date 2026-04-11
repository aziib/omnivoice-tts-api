@echo off
echo Starting OmniVoice TTS API...
uv sync
uv run uvicorn api:app --host 0.0.0.0 --port 8000
pause
