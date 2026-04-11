import os
import uuid
from typing import Optional, List
from contextlib import asynccontextmanager
import gc
import json
import asyncio

import torch
import torchaudio
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from omnivoice import OmniVoice

# Global state
model = None
VOICES_DIR = "voices"
OUTPUTS_DIR = "outputs"
os.makedirs(VOICES_DIR, exist_ok=True)
os.makedirs(OUTPUTS_DIR, exist_ok=True)

# Lock to prevent concurrent VRAM-heavy generations
generation_lock = asyncio.Lock()

def cleanup_vram():
    """Explicitly clear VRAM and run garbage collection."""
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        torch.mps.empty_cache()

def get_device():
    if torch.cuda.is_available():
        num_gpus = torch.cuda.device_count()
        if num_gpus > 1:
            return "auto" # Huggingface accelerate handles 'auto'
        else:
            return "cuda:0"
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    else:
        return "cpu"

@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    device = get_device()
    print(f"Loading OmniVoice model on device: {device}")
    
    dtype = torch.float16 if "cuda" in device or device == "auto" else torch.float32
    
    # Load model
    model = OmniVoice.from_pretrained(
        "k2-fsa/OmniVoice",
        device_map=device,
        dtype=dtype
    )
    print("OmniVoice model loaded successfully.")
    yield
    # Unload
    model = None

app = FastAPI(title="OmniVoice TTS API", lifespan=lifespan)

# Allow CORS for the Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/voices")
async def list_voices():
    voices = []
    if os.path.exists(VOICES_DIR):
        for entry in os.listdir(VOICES_DIR):
            voice_path = os.path.join(VOICES_DIR, entry)
            if os.path.isdir(voice_path):
                # Verify that necessary files exist
                if os.path.exists(os.path.join(voice_path, "ref.wav")) and os.path.exists(os.path.join(voice_path, "ref.txt")):
                    voices.append(entry)
    return JSONResponse(content={"voices": voices})


@app.post("/api/voices")
async def add_voice(
    name: str = Form(...),
    ref_audio: UploadFile = File(...),
    ref_text: Optional[str] = Form("")
):
    """
    Adds a new voice library.
    If ref_text is empty, loads whisper to auto-transcribe the audio, then frees VRAM.
    """
    voice_dir = os.path.join(VOICES_DIR, name)
    os.makedirs(voice_dir, exist_ok=True)
    
    audio_path = os.path.join(voice_dir, "ref.wav")
    text_path = os.path.join(voice_dir, "ref.txt")
    
    # Save audio file
    with open(audio_path, "wb") as f:
        f.write(await ref_audio.read())
        
    text_to_save = ref_text.strip() if ref_text else ""
        
    # Auto-transcribe using Whisper
    if not text_to_save:
        print(f"No reference text provided for voice '{name}'. Loading Whisper to auto-transcribe...")
        try:
            model.load_asr_model()
            text_to_save = model.transcribe(audio_path)
            print(f"Auto-transcribed text: {text_to_save}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to auto-transcribe using Whisper: {e}")
        finally:
            # Explicitly free up VRAM and unload whisper
            model._asr_pipe = None
            cleanup_vram()
            print("Whisper model unloaded to free VRAM or RAM.")

    if not text_to_save:
         raise HTTPException(status_code=400, detail="Reference text is empty and auto-transcription yielded no text.")

    # Save text unconditionally
    with open(text_path, "w", encoding="utf-8") as f:
        f.write(text_to_save)

    return JSONResponse(content={"message": "Voice added successfully", "name": name, "ref_text": text_to_save})


def remove_file(path: str):
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception as e:
        print(f"Failed to clean up file {path}: {e}")


class GenerateRequest(BaseModel):
    text: str
    voice_name: Optional[str] = None
    language: Optional[str] = None # either "Auto" or specific language name
    num_step: Optional[int] = 32
    guidance_scale: Optional[float] = 2.0
    seed: Optional[int] = None


@app.post("/api/generate")
async def generate_speech(req: GenerateRequest, background_tasks: BackgroundTasks):
    """
    Generates TTS using OmniVoice.
    """
    # 1. Determine voice cloning, voice design, or auto voice.
    ref_audio_path = None
    ref_text_content = None
    
    if req.voice_name and req.voice_name.lower() != "auto":
        voice_dir = os.path.join(VOICES_DIR, req.voice_name)
        ref_audio_path = os.path.join(voice_dir, "ref.wav")
        ref_text_path = os.path.join(voice_dir, "ref.txt")
        
        if not os.path.exists(ref_audio_path) or not os.path.exists(ref_text_path):
             raise HTTPException(status_code=404, detail=f"Voice library {req.voice_name} not found or corrupted.")
             
        with open(ref_text_path, "r", encoding="utf-8") as f:
            ref_text_content = f.read().strip()
            
    # Normalize language identifier
    lang_identifier = req.language
    if lang_identifier:
        if lang_identifier.lower() == "auto":
            lang_identifier = None
        elif lang_identifier.lower() == "indonesian" or lang_identifier.lower() == "id":
            # Ensure Indonesian is consistently mapped to 'id' for the model
            lang_identifier = "id"
        
    print(f"Generating TTS for language '{lang_identifier}' using voice '{req.voice_name}' with {req.num_step} steps")
    
    from omnivoice.utils.common import fix_random_seed

    # Fixing RNG Seed
    seed = req.seed
    if seed is None:
        if req.voice_name and req.voice_name.lower() != "auto":
            # Default for Cloning
            seed = 42
        else:
            # Default for Auto
            import time
            seed = int(time.time() * 1000) % 2**32
    
    fix_random_seed(seed)
    print(f"Using seed: {seed}")

    async with generation_lock:
        try:
            with torch.inference_mode():
                if ref_audio_path and ref_text_content:
                    # Voice Cloning Mode
                    audio_out = model.generate(
                        text=req.text,
                        language=lang_identifier,
                        ref_audio=ref_audio_path,
                        ref_text=ref_text_content,
                        num_step=req.num_step,
                        guidance_scale=req.guidance_scale
                    )
                else:
                    # Auto Voice Mode
                    audio_out = model.generate(
                        text=req.text,
                        language=lang_identifier,
                        num_step=req.num_step,
                        guidance_scale=req.guidance_scale
                    )
                
                # Move to CPU immediately to free VRAM
                out_tensor = audio_out[0].cpu()
                del audio_out
            
            # Save temporally so we can respond
            out_filename = f"{uuid.uuid4()}.wav"
            out_filepath = os.path.join(OUTPUTS_DIR, out_filename)
            
            # OmniVoice model sampling rate is generally 24000
            sr = 24000
            if hasattr(model, "sampling_rate") and model.sampling_rate is not None:
                 sr = model.sampling_rate
                 
            torchaudio.save(out_filepath, out_tensor, sr)
            
            background_tasks.add_task(remove_file, out_filepath)
            return FileResponse(out_filepath, media_type="audio/wav")
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            cleanup_vram()
