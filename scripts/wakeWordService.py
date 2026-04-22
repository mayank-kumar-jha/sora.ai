#!/usr/bin/env python3
"""
openWakeWord Service for Kaaya AI
==================================
Connects to the Node.js backend via Socket.IO and listens for PCM audio chunks.
When "Hey Kaaya" (or similar wake word) is detected, emits wake_word:detected.

Requirements:
    pip install openwakeword python-socketio[client] numpy

Usage:
    python scripts/wakeWordService.py
"""

import socketio
import numpy as np
import logging
import sys
import os

# ─── Configuration ───────────────────────────────────────────────────────────

SERVER_URL = os.environ.get("KAAYA_SERVER_URL", "http://localhost:3000")
WAKE_WORD_THRESHOLD = float(os.environ.get("WAKE_WORD_THRESHOLD", "0.5"))
SAMPLE_RATE = 16000
CHUNK_SIZE = 1280  # ~80ms at 16kHz

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [WakeWord] %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger("wakeword")

# ─── Socket.IO Client ───────────────────────────────────────────────────────

sio = socketio.Client(reconnection=True, reconnection_delay=2)

# ─── openWakeWord Model ─────────────────────────────────────────────────────

oww_model = None

def init_model():
    global oww_model
    try:
        from openwakeword.model import Model
        from openwakeword.utils import download_models
        
        # Ensure models are downloaded
        download_models(["hey_jarvis_v0.1"])
        
        oww_model = Model(
            wakeword_models=["hey_jarvis_v0.1"],  # Specific model name
            inference_framework="onnx"
        )
        log.info("✅ openWakeWord model loaded (using 'hey_jarvis' as base)")
        log.info(f"   Threshold: {WAKE_WORD_THRESHOLD}")
        log.info(f"   Available models: {list(oww_model.models.keys())}")
    except ImportError:
        log.error("❌ openwakeword not installed. Run: pip install openwakeword")
        sys.exit(1)
    except Exception as e:
        log.error(f"❌ Failed to load model: {e}")
        sys.exit(1)

# ─── Socket.IO Event Handlers ───────────────────────────────────────────────

@sio.event
def connect():
    log.info(f"🔗 Connected to {SERVER_URL}")
    sio.emit("wake_word:register", {"service": "openwakeword"})

@sio.event
def disconnect():
    log.info("❌ Disconnected from server")

@sio.event
def connect_error(data):
    log.error(f"Connection error: {data}")

@sio.on("wake_word:audio")
def on_audio_chunk(data):
    """Process incoming PCM audio chunk from mobile device."""
    global oww_model
    if oww_model is None:
        return

    try:
        import base64
        
        # Data comes as a dict with "audio" key containing a base64-encoded string
        if isinstance(data, dict) and "audio" in data:
            raw_bytes = base64.b64decode(data["audio"])
            audio = np.frombuffer(raw_bytes, dtype=np.int16)
        elif isinstance(data, bytes):
            audio = np.frombuffer(data, dtype=np.int16)
        elif isinstance(data, str):
            raw_bytes = base64.b64decode(data)
            audio = np.frombuffer(raw_bytes, dtype=np.int16)
        else:
            return

        # Feed to openWakeWord
        prediction = oww_model.predict(audio)

        # Check all model scores
        for model_name, score in prediction.items():
            if score > WAKE_WORD_THRESHOLD:
                log.info(f"🎯 WAKE WORD DETECTED! Model: {model_name}, Score: {score:.3f}")
                sio.emit("wake_word:detected", {
                    "model": model_name,
                    "score": float(score),
                })
                # Reset model state to avoid repeated triggers
                oww_model.reset()
                break

    except Exception as e:
        log.error(f"Audio processing error: {e}")

# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    log.info("=" * 50)
    log.info("  Kaaya Wake Word Service (openWakeWord)")
    log.info("=" * 50)
    log.info(f"  Server: {SERVER_URL}")
    log.info(f"  Threshold: {WAKE_WORD_THRESHOLD}")
    log.info(f"  Sample Rate: {SAMPLE_RATE}Hz")
    log.info(f"  Chunk Size: {CHUNK_SIZE} samples")
    log.info("=" * 50)

    init_model()

    try:
        connect_url = f"{SERVER_URL}?system=wakeword"
        sio.connect(connect_url, transports=["websocket"])
        sio.wait()
    except KeyboardInterrupt:
        log.info("Shutting down...")
        sio.disconnect()
    except Exception as e:
        log.error(f"Fatal error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
