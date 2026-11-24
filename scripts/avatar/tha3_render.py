#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DSH Video Workbench - Talking Head Anime 3 frame renderer (tier 2 of the anime presenter, see
packages/dsh-tool-avatar/ANIME-AVATAR.md).

Loads the THA3 poser once (vendored inference code in ./tha3, MIT; weights CC BY 4.0 by Pramook Khungurn, downloaded by
the installer), reads one pose vector per frame and writes the posed character as raw RGBA frames.

Usage:
  python -I tha3_render.py --doctor --models <tha3 dir> --variant standard_float --device cuda
  python -I tha3_render.py --models <tha3 dir> --variant standard_float --device cuda \
      --image tha-512.png --poses poses.json [--batch 2] [--threads 0]

Render mode: stdout carries ONLY raw frames (512 x 512 x 4 bytes, sRGB, straight alpha, RGB zeroed where alpha is 0);
stderr carries one JSON object per line ({"event": "progress" | "result" | "error" | "log", ...}) plus any library
output. Doctor mode prints one JSON object on stdout.
Exit codes: 0 ok, 2 bad input, 3 out of GPU memory, 4 model files unusable, 5 CUDA unavailable, 1 other.
"""
import argparse
import json
import math
import os
import sys
import time
import traceback

# `python -I` ignores PYTHONIOENCODING: force UTF-8 on the text channels (Windows defaults to the ANSI code page).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

FRAME_OUT = sys.stdout.buffer  # raw frames only
DOCTOR_OUT = sys.stdout
sys.stdout = sys.stderr  # prints of third-party code (THA3 prints while loading) never reach the frame channel

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)  # `python -I` does not add the script folder: the vendored `tha3` package lives here

IMAGE_SIZE = 512
NETWORK_FILES = {
    "eyebrow_decomposer": "eyebrow_decomposer.pt",
    "eyebrow_morphing_combiner": "eyebrow_morphing_combiner.pt",
    "face_morpher": "face_morpher.pt",
    "two_algo_face_body_rotator": "two_algo_face_body_rotator.pt",
    "editor": "editor.pt",
}
VARIANTS = ("standard_float", "separable_float", "standard_half", "separable_half")
T0 = time.time()


def event(obj):
    obj.setdefault("t", round(time.time() - T0, 2))
    sys.stderr.write(json.dumps(obj, ensure_ascii=True) + "\n")
    sys.stderr.flush()


class RenderError(Exception):
    def __init__(self, code, message, exit_code=1):
        super().__init__(message)
        self.code = code
        self.exit_code = exit_code


def pick_device(torch, name):
    if name == "cuda":
        if not torch.cuda.is_available():
            raise RenderError("NO_CUDA", "CUDA is not available", 5)
        return torch.device("cuda")
    if name == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    return torch.device("cpu")


def load_poser(torch, models_dir, variant, device):
    if variant not in VARIANTS:
        raise RenderError("BAD_VARIANT", "unknown model variant %s" % variant, 2)
    vdir = os.path.join(models_dir, variant)
    files = {}
    for key, name in NETWORK_FILES.items():
        p = os.path.join(vdir, name)
        if not os.path.isfile(p):
            raise RenderError("MODEL_MISSING", "missing model file %s" % p, 4)
        files[key] = p
    if device.type == "cpu" and variant.endswith("_half"):
        raise RenderError("BAD_VARIANT", "half precision models need a GPU", 2)
    if variant == "standard_float":
        from tha3.poser.modes.standard_float import create_poser
    elif variant == "separable_float":
        from tha3.poser.modes.separable_float import create_poser
    elif variant == "standard_half":
        from tha3.poser.modes.standard_half import create_poser
    else:
        from tha3.poser.modes.separable_half import create_poser
    try:
        poser = create_poser(device, module_file_names=files)
        poser.get_modules()
    except Exception as exc:
        if is_oom(torch, exc):
            raise RenderError("CUDA_OOM", "not enough GPU memory to load the model", 3)
        raise RenderError("MODEL_LOAD_FAILED", "cannot load the model: %s" % str(exc)[:300], 4)
    return poser


def is_oom(torch, exc):
    oom = getattr(torch, "OutOfMemoryError", None) or getattr(torch.cuda, "OutOfMemoryError", None)
    return (oom is not None and isinstance(exc, oom)) or "out of memory" in str(exc).lower()


def parameter_names():
    from tha3.poser.modes.pose_parameters import get_pose_parameters

    params = get_pose_parameters()
    return [params.get_parameter_name(i) for i in range(params.get_parameter_count())]


def load_image(torch, path, device, dtype):
    """THA3 input: 512x512 RGBA, background pixels (alpha 0) set to (0,0,0,0), sRGB -> linear, scaled to [-1, 1]."""
    import numpy
    import PIL.Image

    try:
        img = PIL.Image.open(path)
        img.load()
    except Exception as exc:
        raise RenderError("BAD_IMAGE", "cannot read the character image: %s" % str(exc)[:200], 2)
    img = img.convert("RGBA")
    if img.size != (IMAGE_SIZE, IMAGE_SIZE):
        img = img.resize((IMAGE_SIZE, IMAGE_SIZE), PIL.Image.LANCZOS)
    a = numpy.asarray(img).astype(numpy.float32) / 255.0
    a[a[:, :, 3] <= 0.0] = 0.0
    rgb = numpy.clip(a[:, :, 0:3], 0.0, 1.0)
    a[:, :, 0:3] = numpy.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    if float(a[:, :, 3].max()) <= 0.0:
        raise RenderError("BAD_IMAGE", "the character image is fully transparent", 2)
    t = torch.from_numpy(a.transpose(2, 0, 1).copy()).to(device=device, dtype=dtype)
    return (t * 2.0 - 1.0).unsqueeze(0)


def load_poses(path, names):
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as exc:
        raise RenderError("BAD_POSES", "cannot read the poses: %s" % str(exc)[:200], 2)
    src_names = data.get("names") or names
    frames = data.get("poses") or []
    if not frames:
        raise RenderError("BAD_POSES", "no poses", 2)
    index = {n: i for i, n in enumerate(src_names)}
    order = [index.get(n, -1) for n in names]
    out = []
    for row in frames:
        out.append([float(row[k]) if k >= 0 and k < len(row) else 0.0 for k in order])
    return out


class FrameConverter:
    """Poser output (B,4,H,W in [-1,1], linear RGB) -> uint8 sRGBA bytes per frame + running bbox of visible pixels."""

    def __init__(self, torch):
        self.torch = torch
        self.bbox = None  # [x0, y0, x1, y1] (x1 / y1 exclusive)

    def __call__(self, out):
        torch = self.torch
        x = ((out.float() + 1.0) * 0.5).clamp_(0.0, 1.0)
        rgb = x[:, 0:3]
        rgb = torch.where(rgb <= 0.003130804953560372, rgb * 12.92, 1.055 * rgb.clamp(min=1e-12) ** (1.0 / 2.4) - 0.055)
        a = x[:, 3:4]
        rgb = rgb * (a > (0.5 / 255.0)).to(rgb.dtype)
        u8 = (torch.cat([rgb, a], dim=1) * 255.0).round_().clamp_(0, 255).to(torch.uint8)
        vis = u8[:, 3] > 2  # (B,H,W)
        rows = vis.any(dim=2).any(dim=0)
        cols = vis.any(dim=1).any(dim=0)
        if bool(rows.any()):
            ys = torch.nonzero(rows).flatten()
            xs = torch.nonzero(cols).flatten()
            b = [int(xs[0]), int(ys[0]), int(xs[-1]) + 1, int(ys[-1]) + 1]
            if self.bbox is None:
                self.bbox = b
            else:
                self.bbox = [min(self.bbox[0], b[0]), min(self.bbox[1], b[1]), max(self.bbox[2], b[2]), max(self.bbox[3], b[3])]
        return u8.permute(0, 2, 3, 1).contiguous().cpu().numpy()


def configure_torch(torch, device, threads):
    if device.type == "cuda":
        # cuDNN autotuning (benchmark=True) grabs ~9 GB of workspace for no measurable gain here: keep it off
        torch.backends.cudnn.benchmark = False
        torch.cuda.reset_peak_memory_stats()
    elif threads and threads > 0:
        torch.set_num_threads(int(threads))


def vram_peak_mb(torch, device):
    if device.type != "cuda":
        return 0
    return int(round(torch.cuda.max_memory_reserved() / (1024 * 1024)))


def synthetic_character(torch, device, dtype):
    """A plain head + body silhouette at the THA3 framing (only to exercise the networks in --doctor)."""
    yy, xx = torch.meshgrid(torch.arange(IMAGE_SIZE, device=device), torch.arange(IMAGE_SIZE, device=device), indexing="ij")
    head = ((xx - 256.0) / 58.0) ** 2 + ((yy - 128.0) / 64.0) ** 2 <= 1.0
    body = (xx > 170) & (xx < 342) & (yy > 185)
    alpha = (head | body).to(torch.float32)
    rgb = torch.stack([0.9 * alpha, 0.75 * alpha, 0.7 * alpha])
    img = torch.cat([rgb, alpha.unsqueeze(0)], dim=0) * 2.0 - 1.0
    return img.unsqueeze(0).to(dtype)


def run_doctor(args):
    import torch

    info = {"ok": False, "torch": torch.__version__, "cudaAvailable": bool(torch.cuda.is_available())}
    try:
        device = pick_device(torch, args.device)
        configure_torch(torch, device, args.threads)
        info["device"] = device.type
        if device.type == "cuda":
            info["gpu"] = torch.cuda.get_device_name(0)
        t = time.time()
        poser = load_poser(torch, args.models, args.variant, device)
        info["loadSecs"] = round(time.time() - t, 2)
        dtype = poser.get_dtype()
        names = parameter_names()
        info["parameters"] = len(names)
        image = synthetic_character(torch, device, dtype)
        batch = max(1, int(args.batch or 2))  # batch 2: +30 % on CUDA (1.1 GB VRAM), +40 % on a CPU
        steps = 6 if device.type == "cuda" else 2
        conv = FrameConverter(torch)
        with torch.inference_mode():
            pose = torch.zeros(batch, len(names), device=device, dtype=dtype)
            conv(poser.pose(image.expand(batch, -1, -1, -1), pose))  # warm-up (cudnn autotune)
            if device.type == "cuda":
                torch.cuda.synchronize()
            t = time.time()
            for k in range(steps):
                pose = torch.zeros(batch, len(names), device=device, dtype=dtype)
                pose[:, names.index("mouth_aaa")] = (k % 2) * 0.8
                pose[:, names.index("head_y")] = 0.2 * math.sin(k)
                conv(poser.pose(image.expand(batch, -1, -1, -1), pose))
            if device.type == "cuda":
                torch.cuda.synchronize()
            secs = time.time() - t
        frames = steps * batch
        info.update(ok=True, variant=args.variant, batch=batch, frames=frames, fps=round(frames / max(secs, 1e-6), 2), secPerFrame=round(secs / frames, 4), vramPeakMb=vram_peak_mb(torch, device))
    except RenderError as exc:
        info.update(code=exc.code, message=str(exc))
    except Exception as exc:
        info.update(code="DOCTOR_FAILED", message=str(exc)[:400], trace=traceback.format_exc()[-1200:])
    DOCTOR_OUT.write(json.dumps(info, ensure_ascii=True) + "\n")
    DOCTOR_OUT.flush()
    return 0 if info.get("ok") else 1


def run_render(args):
    import torch

    device = pick_device(torch, args.device)
    configure_torch(torch, device, args.threads)
    t_load = time.time()
    poser = load_poser(torch, args.models, args.variant, device)
    dtype = poser.get_dtype()
    names = parameter_names()
    image = load_image(torch, args.image, device, dtype)
    poses = load_poses(args.poses, names)
    total = len(poses)
    event({"event": "loaded", "device": device.type, "variant": args.variant, "frames": total, "loadSecs": round(time.time() - t_load, 2)})
    batch = max(1, int(args.batch or 2))  # batch 2: +30 % on CUDA (1.1 GB VRAM), +40 % on a CPU
    conv = FrameConverter(torch)
    done = 0
    t_start = time.time()
    last_report = 0.0
    with torch.inference_mode():
        while done < total:
            n = min(batch, total - done)
            pose = torch.tensor(poses[done:done + n], device=device, dtype=dtype)
            try:
                out = poser.pose(image.expand(n, -1, -1, -1), pose)
                frames = conv(out)
            except Exception as exc:
                if device.type == "cuda" and is_oom(torch, exc):
                    if batch > 1:
                        batch = 1
                        torch.cuda.empty_cache()
                        event({"event": "log", "message": "out of GPU memory, continuing one frame at a time"})
                        continue
                    raise RenderError("CUDA_OOM", "not enough GPU memory", 3)
                raise
            try:
                for k in range(n):
                    FRAME_OUT.write(frames[k].tobytes())
                FRAME_OUT.flush()
            except (BrokenPipeError, OSError):
                event({"event": "log", "message": "frame pipe closed"})
                return 0
            done += n
            now = time.time()
            if now - last_report >= 0.5 or done == total:
                last_report = now
                el = max(now - t_start, 1e-6)
                event({"event": "progress", "done": done, "total": total, "fps": round(done / el, 2)})
    secs = time.time() - t_start
    event({
        "event": "result",
        "ok": True,
        "frames": total,
        "width": IMAGE_SIZE,
        "height": IMAGE_SIZE,
        "bbox": conv.bbox or [0, 0, IMAGE_SIZE, IMAGE_SIZE],
        "secs": round(secs, 3),
        "fps": round(total / max(secs, 1e-6), 2),
        "device": device.type,
        "variant": args.variant,
        "batch": batch,
        "vramPeakMb": vram_peak_mb(torch, device),
    })
    return 0


def main():
    ap = argparse.ArgumentParser(description="Talking Head Anime 3 frame renderer")
    ap.add_argument("--doctor", action="store_true")
    ap.add_argument("--models", required=True, help="folder holding <variant>/*.pt")
    ap.add_argument("--variant", default="standard_float", choices=VARIANTS)
    ap.add_argument("--device", default="auto", choices=("auto", "cuda", "cpu"))
    ap.add_argument("--image", default="")
    ap.add_argument("--poses", default="")
    ap.add_argument("--batch", type=int, default=0)
    ap.add_argument("--threads", type=int, default=0)
    args = ap.parse_args()
    if args.doctor:
        return run_doctor(args)
    if not args.image or not args.poses:
        event({"event": "error", "code": "BAD_ARGS", "message": "--image and --poses are required"})
        return 2
    try:
        return run_render(args)
    except RenderError as exc:
        event({"event": "error", "code": exc.code, "message": str(exc)})
        return exc.exit_code
    except Exception as exc:
        event({"event": "error", "code": "RENDER_FAILED", "message": str(exc)[:400], "trace": traceback.format_exc()[-1500:]})
        return 1


if __name__ == "__main__":
    sys.exit(main())
