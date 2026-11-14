#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DSH Video Workbench - Persistent IndexTTS-2 HTTP Server
Loads the compiled IndexTTS-2 engine (`cy_app.tts`) ONCE and serves synthesis requests,
so each sentence takes seconds instead of reloading the 6GB model every time.

Usage:  python tts-server.py --root <INDEXTTS_ROOT> --port 9880
Endpoints:
  GET  /health          -> {"ok": true, "ready": bool}
  POST /tts  (JSON)     -> writes WAV to `output_path`, returns {"ok": true, "output_path": ...}
Zero hardcoded paths: everything comes from CLI args / env.
"""
import argparse
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATE = {"ready": False, "error": "", "tts": None, "loaded_sec": 0.0, "root": ""}
LOCK = threading.Lock()


def load_engine(root):
    t0 = time.time()
    try:
        os.chdir(root)
        if root not in sys.path:
            sys.path.insert(0, root)
        import cy_app  # type: ignore

        tts = getattr(cy_app, "tts", None)
        if tts is None:
            raise RuntimeError("cy_app.tts not available")
        STATE["tts"] = tts
        STATE["ready"] = True
        STATE["loaded_sec"] = round(time.time() - t0, 1)
        print(f"[tts-server] IndexTTS-2 ready in {STATE['loaded_sec']}s", flush=True)
    except Exception as exc:  # noqa
        STATE["error"] = f"{exc}"
        traceback.print_exc()


def synthesize(payload):
    tts = STATE["tts"]
    text = (payload.get("text") or "").strip()
    out = payload.get("output_path") or ""
    spk = payload.get("spk_audio_prompt") or payload.get("ref_audio_path") or ""
    emo_audio = payload.get("emo_audio_prompt") or ""
    emotion = payload.get("emotion") or ""
    if not text or not out:
        raise ValueError("text and output_path are required")
    if not spk or not os.path.exists(spk):
        fallback = payload.get("fallback_ref") or ""
        if fallback and os.path.exists(fallback):
            spk = fallback
        else:
            raise ValueError(f"speaker reference not found: {spk}")

    fd, tmp_out = tempfile.mkstemp(prefix="dsh_srv_", suffix=".wav")
    os.close(fd)
    kwargs = {
        "spk_audio_prompt": spk,
        "text": text,
        "output_path": tmp_out,
        "verbose": False,
    }
    if emo_audio and os.path.exists(emo_audio):
        kwargs["emo_audio_prompt"] = emo_audio
        kwargs["emo_alpha"] = float(payload.get("emo_alpha", 0.6))
    elif emotion and emotion not in ("平静", "neutral"):
        kwargs["use_emo_text"] = True
        kwargs["emo_text"] = emotion
    with LOCK:
        tts.infer(**kwargs)
    if not os.path.exists(tmp_out) or os.path.getsize(tmp_out) < 1000:
        raise RuntimeError("IndexTTS-2 produced no audio")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    shutil.move(tmp_out, out)
    return out


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):  # quieter logs
        return

    def do_GET(self):
        if self.path.startswith("/health"):
            self._json(200, {
                "ok": True,
                "engine": "indextts2",
                "ready": STATE["ready"],
                "error": STATE["error"],
                "loadedSec": STATE["loaded_sec"],
            })
        else:
            self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if not self.path.startswith("/tts"):
            self._json(404, {"ok": False, "error": "not found"})
            return
        if not STATE["ready"]:
            self._json(503, {"ok": False, "error": STATE["error"] or "engine loading"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            t0 = time.time()
            out = synthesize(payload)
            self._json(200, {"ok": True, "output_path": out, "elapsedSec": round(time.time() - t0, 2)})
        except Exception as exc:  # noqa
            traceback.print_exc()
            self._json(500, {"ok": False, "error": str(exc)})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--port", type=int, default=9880)
    ap.add_argument("--host", default="127.0.0.1")
    a = ap.parse_args()
    STATE["root"] = a.root
    server = ThreadingHTTPServer((a.host, a.port), Handler)
    threading.Thread(target=load_engine, args=(a.root,), daemon=True).start()
    print(f"[tts-server] listening on http://{a.host}:{a.port} (loading model...)", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
