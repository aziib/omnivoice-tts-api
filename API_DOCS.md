# OmniVoice TTS API Documentation

The OmniVoice TTS API is powered by FastAPI. When the API server is running, you can always view the interactive, live documentation (Swagger UI) by navigating your browser to:
**http://localhost:8000/docs**

Below is a detailed guide on the available endpoints and how to use them manually via tools like `cURL` or Python.

---

## 1. Get Available Voices
Retrieves a list of all saved voice variants available in the system.

- **URL:** `/api/voices`
- **Method:** `GET`
- **Response Format:** JSON

**Example using cURL:**
```bash
curl -X GET http://localhost:8000/api/voices
```

**Response Example:**
```json
{
  "voices": [
    "jarvis",
    "my_custom_voice"
  ]
}
```

---

## 2. Add a Voice Library
Uploads a reference audio file and name to create a voice clone. Optionally provide the transcribed text. If the transcript is not provided, the API automatically uses Whisper to transcribe it, saving your system resources by dynamically purging the process right after.

- **URL:** `/api/voices`
- **Method:** `POST`
- **Content-Type:** `multipart/form-data`

### Form Parameters:
- `name` (string) **[Required]**: Name/ID to save the voice under (e.g. `test_voice`).
- `ref_audio` (file) **[Required]**: The audio file to use as a cloning reference (ideally 3-10 sec of clear speech). Minimum format needed is `.wav` or `.mp3`.
- `ref_text` (string) **[Optional]**: The exact transcribed text spoken in the `ref_audio`. If left empty, the API will generate it.

**Example using cURL (With auto-transcription):**
```bash
curl -X POST http://localhost:8000/api/voices \
  -F "name=my_voice" \
  -F "ref_audio=@/path/to/my_audio.wav"
```

**Example using Python (`requests`):**
```python
import requests

url = "http://localhost:8000/api/voices"
files = {'ref_audio': open('my_audio.wav', 'rb')}
data = {'name': 'my_voice', 'ref_text': 'This is what the audio says.'}

response = requests.post(url, files=files, data=data)
print(response.json())
```

---

## 3. Generate Speech (Inference)
Generates audio from text using OmniVoice. You can select an explicit language and voice, or leave them as Auto for the model to handle dynamically.

- **URL:** `/api/generate`
- **Method:** `POST`
- **Content-Type:** `application/json`

### JSON Body Parameters:
- `text` (string) **[Required]**: The text you want to synthesize into speech.
- `voice_name` (string) **[Optional]**: The name of the saved voice in the library. Set to `Auto` to use the model's default voice.
- `language` (string) **[Optional]**: The language for synthesis (e.g., `English`, `Indonesian`). Set to `Auto` for detection.
- `num_step` (integer) **[Optional]**: Number of inference steps (default: `32`). Higher values generally improve quality but take longer.
- `guidance_scale` (float) **[Optional]**: Classifier-free guidance scale (default: `2.0`). Controls how strongly the model follows the prompt.
- `seed` (integer) **[Optional]**: Random seed for reproducible generation. If not provided, a random seed is used (or `42` for voice cloning).
- `speed` (float) **[Optional]**: Speech rate factor (default: `1.0`). Values `>1.0` produce faster speech, `<1.0` produce slower speech. Range: `0.5` to `2.0`.

**Example using cURL:**
```bash
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
        "text": "Hello, activating the primary systems now.", 
        "voice_name": "jarvis", 
        "language": "English"
      }' \
  --output result.wav
```

**Example using Python (`requests`):**
```python
import requests

url = "http://localhost:8000/api/generate"
payload = {
    "text": "Hello world! This is generated using OmniVoice API.",
    "voice_name": "Auto",
    "language": "English"
}

response = requests.post(url, json=payload)

# Save the binary response to a wav file
with open('output.wav', 'wb') as f:
    f.write(response.content)
```
