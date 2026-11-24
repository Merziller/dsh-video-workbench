#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DSH Video Workbench - local photo -> anime likeness with a transparent background (anime presenter, see
packages/dsh-tool-avatar/ANIME-AVATAR.md).

  * DCT-Net (Men et al., SIGGRAPH 2022; https://github.com/menyifang/DCT-Net) - Apache License 2.0, code and the
    ModelScope weights (iic/cv_unet_person-image-cartoon*_compound-models). The inference steps below follow the
    official `source/cartoonize.py` + `source/facelib` (face detector / landmarks from Peppa_Pig_Face_Engine,
    Apache-2.0) and the 5-point alignment of `mtcnn_pytorch/src/align_trans.py` (MIT); re-implemented here, the
    networks run unmodified as TensorFlow frozen graphs.
  * U^2-Net human segmentation (Qin et al.; Apache-2.0), ONNX export distributed by rembg (MIT), finds the person on
    the photo; SkyTNT anime-segmentation (isnetis.onnx, Apache-2.0) traces the outline on the stylized picture.

Usage:
  python -I anime_stylize.py --doctor --models <install>/models
  python -I anime_stylize.py --models <install>/models --style anime --input photo.jpg --output out.png
stdout: one JSON object per line ({"event": "progress" | "result" | "error", ...}); everything else goes to stderr.
"""
import argparse
import json
import os
import sys
import time
import traceback

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

REAL_STDOUT = sys.stdout
sys.stdout = sys.stderr  # library prints never pollute the JSON channel
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

STYLES = ("anime", "3d", "design", "handdrawn", "sketch", "artstyle", "illustration")
T0 = time.time()

# 5 reference points (eye, eye, nose, mouth corner, mouth corner) of the 96x112 crop, made square (align_trans.py)
REFERENCE_5PTS = [
    [30.29459953 + 1 + 8, 51.69630051 + 1],
    [65.53179932 + 1 + 8, 51.50139999 + 1],
    [48.02519989 + 1 + 8, 71.73660278 + 1],
    [33.54930115 + 1 + 8, 92.3655014 + 1],
    [62.72990036 + 1 + 8, 92.20410156 + 1],
]
HEAD_BOX = 288
PIXEL_MEANS = (123.0, 116.0, 103.0)  # RGB, facelib config
DETECT_SIZE = 512
DETECT_THRESHOLD = 0.8
KEYPOINT_SIZE = 160
MIN_FACE = 60


def emit(obj):
    obj.setdefault("t", round(time.time() - T0, 2))
    REAL_STDOUT.write(json.dumps(obj, ensure_ascii=True) + "\n")
    REAL_STDOUT.flush()


def progress(pct, message):
    emit({"event": "progress", "pct": pct, "message": message})


class StylizeError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


# ------------------------------------------------------------------------------------------------ TensorFlow graphs


class FrozenGraph:
    def __init__(self, tf1, path):
        if not os.path.isfile(path):
            raise StylizeError("MODEL_MISSING", "missing model file %s" % path)
        self.graph = tf1.Graph()
        with self.graph.as_default():
            gd = tf1.GraphDef()
            with open(path, "rb") as f:
                gd.ParseFromString(f.read())
            tf1.import_graph_def(gd, name="")
        cfg = tf1.ConfigProto(allow_soft_placement=True)
        self.sess = tf1.Session(graph=self.graph, config=cfg)

    def tensor(self, name):
        return self.graph.get_tensor_by_name(name)

    def run(self, fetches, feed):
        return self.sess.run(fetches, feed_dict=feed)


def tf_compat():
    import tensorflow as tf

    return tf.compat.v1


class Cartoonizer:
    def __init__(self, models_dir, style):
        import cv2
        import numpy as np

        tf1 = tf_compat()
        dct = os.path.join(models_dir, "dctnet")
        self.style = style
        self.head = FrozenGraph(tf1, os.path.join(dct, style, "cartoon_h.pb"))
        self.bg = FrozenGraph(tf1, os.path.join(dct, style, "cartoon_bg.pb"))
        self.detector = FrozenGraph(tf1, os.path.join(dct, "common", "detector.pb"))
        self.keypoints = FrozenGraph(tf1, os.path.join(dct, "common", "keypoints.pb"))
        mask_path = os.path.join(dct, "common", "alpha.jpg")
        raw = cv2.imdecode(np.fromfile(mask_path, dtype=np.uint8), cv2.IMREAD_COLOR)
        if raw is None:
            raise StylizeError("MODEL_MISSING", "cannot read %s" % mask_path)
        raw = cv2.resize(raw, (HEAD_BOX, HEAD_BOX), interpolation=cv2.INTER_AREA)
        self.head_mask = cv2.cvtColor(raw, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0

    # -- networks
    def run_style(self, model, bgr):
        import numpy as np

        return model.run(model.tensor("output_image:0"), {model.tensor("input_image:0"): bgr.astype(np.float32)})

    def detect_faces(self, rgb):
        """[x1, y1, x2, y2, score] in pixels of `rgb` (facelib FaceDetector)."""
        import cv2
        import numpy as np

        h, w = rgb.shape[:2]
        scale = DETECT_SIZE / max(h, w)
        small = cv2.resize(rgb, None, fx=scale, fy=scale)
        canvas = np.zeros((DETECT_SIZE, DETECT_SIZE, 3), dtype=np.uint8) + np.array(PIXEL_MEANS, dtype=np.uint8)
        canvas[: small.shape[0], : small.shape[1]] = small
        d = self.detector
        boxes, scores, num = d.run(
            [d.tensor("tower_0/boxes:0"), d.tensor("tower_0/scores:0"), d.tensor("tower_0/num_detections:0")],
            {d.tensor("tower_0/images:0"): canvas[None].astype(np.float32), d.tensor("training_flag:0"): False},
        )
        n = int(num[0])
        boxes = boxes[0][:n]
        scores = scores[0][:n]
        keep = scores > DETECT_THRESHOLD
        boxes = boxes[keep] * (DETECT_SIZE / scale)
        scores = scores[keep]
        return [[float(b[1]), float(b[0]), float(b[3]), float(b[2]), float(s)] for b, s in zip(boxes, scores)]

    def landmarks(self, rgb, box):
        """68 landmarks (facelib FaceLandmark), or None for a face smaller than MIN_FACE."""
        import cv2
        import numpy as np

        x1, y1, x2, y2 = box[:4]
        bw, bh = x2 - x1, y2 - y1
        if bw <= MIN_FACE and bh <= MIN_FACE:
            return None
        add = int(max(bw, bh))
        big = cv2.copyMakeBorder(rgb, add, add, add, add, borderType=cv2.BORDER_CONSTANT, value=PIXEL_MEANS)
        bx1, by1, bx2, by2 = x1 + add, y1 + add, x2 + add, y2 + add
        edge = (1 + 2 * 0.2) * bw
        cx, cy = (bx1 + bx2) // 2, (by1 + by2) // 2
        crop_box = np.array([cx - edge // 2, cy - edge // 2, cx + edge // 2, cy + edge // 2]).astype(np.int64)
        crop = big[crop_box[1]:crop_box[3], crop_box[0]:crop_box[2], :]
        ch, cw = crop.shape[:2]
        if ch < 2 or cw < 2:
            return None
        crop = cv2.resize(crop, (KEYPOINT_SIZE, KEYPOINT_SIZE)).astype(np.float32)
        k = self.keypoints
        pred = k.run(k.tensor("tower_0/prediction:0"), {k.tensor("tower_0/images:0"): crop[None], k.tensor("training_flag:0"): False})
        pts = pred[0][:136].reshape((-1, 2))
        out = np.zeros((68, 2), dtype=np.float32)
        out[:, 0] = (pts[:, 0] * cw + crop_box[0] - add).astype(np.int64)
        out[:, 1] = (pts[:, 1] * ch + crop_box[1] - add).astype(np.int64)
        return out

    # -- full pipeline (official cartoonize(), every face, the largest first)
    def cartoonize(self, rgb):
        import cv2
        import numpy as np

        bgr = rgb[:, :, ::-1]
        h, w = rgb.shape[:2]
        nh, nw = (h + 15) // 16 * 16, (w + 15) // 16 * 16
        pad = np.full((nh, nw, 3), 255, dtype=np.uint8)
        pad[:h, :w] = bgr
        res = self.run_style(self.bg, pad)[:h, :w, :].astype(np.float32)
        faces = []
        for box in self.detect_faces(rgb):
            lm = self.landmarks(rgb, box)
            if lm is not None:
                faces.append((lm, box))
        faces.sort(key=lambda f: -float((f[0][:, 0].max() - f[0][:, 0].min()) * (f[0][:, 1].max() - f[0][:, 1].min())))
        for lm, _box in faces:
            f5p = five_points(lm, bgr)
            head_img, inv = warp_and_crop_face(rgb, f5p)
            head_res = self.run_style(self.head, head_img[:, :, ::-1]).astype(np.float32)
            head_back = cv2.warpAffine(head_res, inv, (w, h), borderValue=(0, 0, 0))
            m = cv2.warpAffine(self.head_mask, inv, (w, h), borderValue=(0, 0, 0))[:, :, None]
            res = m * head_back + (1.0 - m) * res
        return np.clip(res, 0, 255).astype(np.uint8), faces


def find_pupil(lm, bgr):
    import cv2
    import numpy as np

    h, w = bgr.shape[:2]
    xmax, xmin = int(lm[:, 0].max()), int(lm[:, 0].min())
    ymax, ymin = int(lm[:, 1].max()), int(lm[:, 1].min())
    if ymin >= ymax or xmin >= xmax or ymin < 0 or xmin < 0 or ymax > h or xmax > w:
        return None
    eye = cv2.equalizeHist(cv2.cvtColor(np.ascontiguousarray(bgr[ymin:ymax, xmin:xmax, :]), cv2.COLOR_BGR2GRAY))
    marks = lm - np.array([xmin, ymin]).reshape([1, 2])
    mask = cv2.fillConvexPoly(np.zeros_like(eye), marks.astype(np.int32), 1)
    _, th = cv2.threshold(eye, 100, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    th = (1 - th / 255.0) * mask
    ys, xs = np.nonzero(th > 0.5)
    if len(xs):
        xm, ym = np.sort(xs)[len(xs) // 2], np.sort(ys)[len(ys) // 2]
    else:
        xm, ym = th.shape[1] / 2, th.shape[0] / 2
    return xm + xmin, ym + ymin


def five_points(lm, bgr):
    """Pupils (or eye means), nose tip and mouth corners - the official get_f5p (eye ranges 36:41 / 42:47 as there)."""
    left = find_pupil(lm[36:41], bgr)
    right = find_pupil(lm[42:47], bgr)
    if left is None or right is None:
        left = lm[36:41].mean(axis=0)
        right = lm[42:47].mean(axis=0)
    return [[left[0], left[1]], [right[0], right[1]], [lm[30][0], lm[30][1]], [lm[48][0], lm[48][1]], [lm[54][0], lm[54][1]]]


def _nonreflective_similarity(uv, xy):
    """Least-squares similarity with Tinv mapping xy -> uv (MATLAB cp2tform 'nonreflective similarity')."""
    import numpy as np

    n = xy.shape[0]
    x = xy[:, 0].reshape((-1, 1))
    y = xy[:, 1].reshape((-1, 1))
    X = np.vstack((np.hstack((x, y, np.ones((n, 1)), np.zeros((n, 1)))), np.hstack((y, -x, np.zeros((n, 1)), np.ones((n, 1))))))
    U = np.vstack((uv[:, 0].reshape((-1, 1)), uv[:, 1].reshape((-1, 1))))
    r = np.linalg.lstsq(X, U, rcond=None)[0].flatten()
    sc, ss, tx, ty = r
    tinv = np.array([[sc, -ss, 0], [ss, sc, 0], [tx, ty, 1]])
    t = np.linalg.inv(tinv)
    t[:, 2] = np.array([0, 0, 1])
    return t, tinv


def similarity_for_cv2(src, dst):
    """2x3 cv2 matrices (forward, inverse) of the best (non-)reflective similarity src -> dst (cp2tform 'similarity')."""
    import numpy as np

    t1, t1inv = _nonreflective_similarity(src, dst)
    dst_r = dst.copy()
    dst_r[:, 0] = -dst_r[:, 0]
    t2r, _ = _nonreflective_similarity(src, dst_r)
    t2 = np.dot(t2r, np.array([[-1, 0, 0], [0, 1, 0], [0, 0, 1]]))

    def fwd(t, pts):
        return np.dot(np.hstack((pts, np.ones((pts.shape[0], 1)))), t)[:, 0:2]

    if np.linalg.norm(fwd(t1, src) - dst) <= np.linalg.norm(fwd(t2, src) - dst):
        t, tinv = t1, t1inv
    else:
        t, tinv = t2, np.linalg.inv(t2)
    return t[:, 0:2].T, tinv[:, 0:2].T


def warp_and_crop_face(rgb, f5p, ratio=0.75):
    import cv2
    import numpy as np

    ref = np.float32(REFERENCE_5PTS)
    ref = (ref - 112 / 2) * ratio + 112 / 2
    ref *= HEAD_BOX / 112.0
    fwd, inv = similarity_for_cv2(np.float32(f5p).astype(np.float64), ref.astype(np.float64))
    face = cv2.warpAffine(rgb, fwd, (HEAD_BOX, HEAD_BOX), borderValue=(255, 255, 255))
    return face, inv


# ----------------------------------------------------------------------------------------------------- cut-out


class PersonSegmenter:
    """U^2-Net human segmentation (rembg's preprocessing: 320x320 Lanczos, scaled by the max pixel, ImageNet stats)."""

    def __init__(self, path):
        import onnxruntime as ort

        if not os.path.isfile(path):
            raise StylizeError("MODEL_MISSING", "missing model file %s" % path)
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        self.sess = ort.InferenceSession(path, sess_options=opts, providers=["CPUExecutionProvider"])
        self.input = self.sess.get_inputs()[0].name

    def mask(self, rgb):
        import numpy as np
        from PIL import Image

        img = Image.fromarray(rgb)
        im = np.asarray(img.resize((320, 320), Image.LANCZOS)).astype(np.float64)
        im = im / max(1.0, float(im.max()))
        mean, std = (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)
        x = np.zeros((320, 320, 3))
        for c in range(3):
            x[:, :, c] = (im[:, :, c] - mean[c]) / std[c]
        pred = self.sess.run(None, {self.input: x.transpose((2, 0, 1))[None].astype(np.float32)})[0][:, 0, :, :]
        mi, ma = float(pred.min()), float(pred.max())
        pred = (pred - mi) / max(1e-6, ma - mi)
        m = Image.fromarray((np.squeeze(pred) * 255).astype(np.uint8)).resize(img.size, Image.LANCZOS)
        return np.asarray(m).astype(np.float32) / 255.0


class AnimeSegmenter:
    """Anime character segmentation (SkyTNT anime-segmentation `isnetis.onnx`, Apache-2.0) with the author's own
    preprocessing: [0, 1] RGB letter-boxed into 1024 x 1024, sigmoid output. Runs on the stylized picture, whose
    outline it follows more closely than a photo segmenter."""

    SIZE = 1024

    def __init__(self, path):
        import onnxruntime as ort

        if not os.path.isfile(path):
            raise StylizeError("MODEL_MISSING", "missing model file %s" % path)
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        self.sess = ort.InferenceSession(path, sess_options=opts, providers=["CPUExecutionProvider"])
        self.input = self.sess.get_inputs()[0].name

    def mask(self, rgb):
        import cv2
        import numpy as np

        s = self.SIZE
        x = (rgb / 255.0).astype(np.float32)
        h0, w0 = x.shape[:2]
        h, w = (s, int(s * w0 / h0)) if h0 > w0 else (int(s * h0 / w0), s)
        ph, pw = s - h, s - w
        inp = np.zeros([s, s, 3], dtype=np.float32)
        inp[ph // 2:ph // 2 + h, pw // 2:pw // 2 + w] = cv2.resize(x, (w, h))
        m = self.sess.run(None, {self.input: inp.transpose(2, 0, 1)[None]})[0][0]
        m = m.transpose(1, 2, 0)[ph // 2:ph // 2 + h, pw // 2:pw // 2 + w]
        return np.clip(cv2.resize(m, (w0, h0)), 0.0, 1.0).astype(np.float32)


def keep_main_person(mask, face_box):
    """Keep the person whose silhouette holds the main face (other people / stray blobs are dropped); soft edges kept."""
    import cv2
    import numpy as np

    hard = (mask > 0.5).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(hard, connectivity=8)
    if n <= 1:
        return mask
    keep = set()
    if face_box is not None:
        x1, y1, x2, y2 = [int(round(v)) for v in face_box]
        h, w = mask.shape
        region = labels[max(0, y1):min(h, y2), max(0, x1):min(w, x2)]
        ids, counts = np.unique(region[region > 0], return_counts=True)
        if len(ids):
            keep.add(int(ids[np.argmax(counts)]))
    if not keep:
        keep.add(int(1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])))
    sel = np.isin(labels, list(keep)).astype(np.uint8)
    near = cv2.dilate(sel, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    return mask * near.astype(np.float32)


def key_out_wall(photo, alpha, head_bottom):
    """Around the head only, near the outline: pixels whose PHOTO colour matches a locally uniform background (a wall
    showing between flyaway hair) become transparent. Skipped where the background is busy."""
    import cv2
    import numpy as np

    h, w = alpha.shape
    bg = (alpha < 0.05).astype(np.float32)
    if bg.mean() < 0.05 or head_bottom <= 0:
        return alpha
    lab = cv2.cvtColor(np.ascontiguousarray(photo), cv2.COLOR_RGB2LAB).astype(np.float32)
    sig = max(h, w) * 0.03
    den = cv2.GaussianBlur(bg, (0, 0), sig)
    mean = cv2.GaussianBlur(lab * bg[:, :, None], (0, 0), sig) / np.maximum(den, 1e-6)[:, :, None]
    sq = cv2.GaussianBlur((lab * lab) * bg[:, :, None], (0, 0), sig) / np.maximum(den, 1e-6)[:, :, None]
    spread = np.sqrt(np.maximum(sq - mean * mean, 0.0).sum(axis=2))
    dist = np.linalg.norm(lab - mean, axis=2)
    inside = (alpha > 0.5).astype(np.uint8)
    depth = cv2.distanceTransform(inside, cv2.DIST_L2, 3)
    band = (depth > 0) & (depth < max(h, w) * 0.06) & (den > 0.05) & (spread < 12.0)
    band[int(min(h, max(0, head_bottom))):, :] = False
    ramp = np.clip((dist - 10.0) / 10.0, 0.0, 1.0)
    out = alpha.copy()
    out[band] = np.minimum(out[band], ramp[band])
    return out


def refine_cutout(rgb, mask):
    """Tighter edges without the photo's background fringe: the soft mask is steepened and shaved by ~1 px, and every
    semi-transparent edge pixel takes its colour from the nearby solid inside (normalised blur "push")."""
    import cv2
    import numpy as np

    a = np.clip((mask - 0.25) / 0.5, 0.0, 1.0)
    a = a * a * (3.0 - 2.0 * a)
    a = cv2.erode(a, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    a = cv2.GaussianBlur(a, (0, 0), 0.7)
    a[a < 0.02] = 0.0
    out = rgb.astype(np.float32)
    solid = (a >= 0.92).astype(np.float32)
    need = (a > 0.0) & (a < 0.92)
    if solid.sum() > 0 and need.any():
        num = out * solid[:, :, None]
        for sigma in (2.0, 5.0, 12.0, 30.0):
            n = cv2.GaussianBlur(num, (0, 0), sigma)
            d = cv2.GaussianBlur(solid, (0, 0), sigma)
            sel = need & (d > 1e-3)
            if sel.any():
                out[sel] = n[sel] / d[sel][:, None]
                need &= ~sel
            if not need.any():
                break
    return np.clip(out, 0, 255), a


# ------------------------------------------------------------------------------------------------------- main


def load_photo(path, max_side):
    import numpy as np
    from PIL import Image, ImageOps

    try:
        img = Image.open(path)
        img = ImageOps.exif_transpose(img)
        img.load()
    except Exception as exc:
        raise StylizeError("BAD_IMAGE", "cannot read the photo: %s" % str(exc)[:200])
    alpha = None
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = np.asarray(img.convert("RGBA"))
        a = rgba[:, :, 3].astype(np.float32) / 255.0
        if float((a < 0.5).mean()) > 0.01:
            alpha = a
        bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
        img = Image.alpha_composite(bg, img.convert("RGBA"))
    img = img.convert("RGB")
    w, h = img.size
    # DCT-Net works at a short side of at most 720 px (official resize_size); bigger photos only cost time
    s = min(1.0, 720.0 / min(w, h), float(max_side) / max(w, h))
    if s < 1.0:
        nw, nh = max(1, int(round(w * s))), max(1, int(round(h * s)))
        img = img.resize((nw, nh), Image.LANCZOS)
        if alpha is not None:
            alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).resize((nw, nh), Image.LANCZOS)).astype(np.float32) / 255.0
    return np.asarray(img), alpha


def installed_styles(models_dir):
    dct = os.path.join(models_dir, "dctnet")
    return [s for s in STYLES if os.path.isfile(os.path.join(dct, s, "cartoon_h.pb")) and os.path.isfile(os.path.join(dct, s, "cartoon_bg.pb"))]


def run_stylize(args):
    import numpy as np
    from PIL import Image

    styles = installed_styles(args.models)
    if not styles:
        raise StylizeError("NOT_INSTALLED", "no DCT-Net style is installed")
    style = args.style if args.style in styles else ("anime" if "anime" in styles else styles[0])
    note = "" if style == args.style else "style %s is not installed, used %s" % (args.style, style)
    progress(5, "loading")
    rgb, alpha_in = load_photo(args.input, args.max_side)
    h, w = rgb.shape[:2]
    if min(h, w) < 64:
        raise StylizeError("BAD_IMAGE", "the photo is too small")
    cart = Cartoonizer(args.models, style)
    progress(25, "stylizing")
    t = time.time()
    out_bgr, faces = cart.cartoonize(rgb)
    secs_style = time.time() - t
    if not faces and not args.allow_no_face:
        raise StylizeError("NO_FACE", "no clear face found in the photo")
    progress(70, "cutting out")
    if alpha_in is not None:
        alpha = alpha_in
        seg_note = "used the photo's own transparency"
    else:
        # where the person is: U^2-Net on the photo (robust); the outline: the anime segmenter on the stylized picture
        human = PersonSegmenter(os.path.join(args.models, "u2net", "u2net_human_seg.onnx")).mask(rgb)
        anime = AnimeSegmenter(os.path.join(args.models, "animeseg", "isnetis.onnx")).mask(out_bgr[:, :, ::-1])
        main_box = None
        if faces:
            lm = faces[0][0]
            main_box = [lm[:, 0].min(), lm[:, 1].min(), lm[:, 0].max(), lm[:, 1].max()]
        alpha = keep_main_person(np.minimum(anime, np.clip(human * 1.5, 0.0, 1.0)), main_box)
        if main_box is not None:
            alpha = key_out_wall(rgb, alpha, main_box[3] + 0.15 * (main_box[3] - main_box[1]))
        seg_note = ""
    out_rgb = out_bgr[:, :, ::-1].astype(np.float32)
    if alpha_in is None:
        out_rgb, alpha = refine_cutout(out_rgb, alpha)
    else:
        alpha = np.where(alpha < 0.04, 0.0, alpha)
    share = float((alpha > 0.5).mean())
    if share < 0.03:
        raise StylizeError("NO_PERSON", "no person found in the photo")
    a8 = np.clip(alpha * 255.0 + 0.5, 0, 255).astype(np.uint8)
    out_rgb[a8 == 0] = 0
    rgba = np.dstack([np.clip(out_rgb, 0, 255).astype(np.uint8), a8])
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    tmp = args.output + ".tmp.png"
    Image.fromarray(rgba).save(tmp, format="PNG", optimize=False)
    os.replace(tmp, args.output)
    emit({
        "event": "result",
        "ok": True,
        "path": os.path.abspath(args.output),
        "width": int(w),
        "height": int(h),
        "faces": len(faces),
        "style": style,
        "styles": styles,
        "personShare": round(share, 3),
        "secsStyle": round(secs_style, 3),
        "secs": round(time.time() - T0, 3),
        "note": "; ".join(x for x in (note, seg_note) if x),
    })
    return 0


def run_doctor(args):
    import numpy as np

    info = {"ok": False}
    try:
        import tensorflow as tf
        import cv2
        import onnxruntime

        info.update(tensorflow=tf.__version__, opencv=cv2.__version__, onnxruntime=onnxruntime.__version__)
        styles = installed_styles(args.models)
        info["styles"] = styles
        if not styles:
            raise StylizeError("NOT_INSTALLED", "no DCT-Net style is installed")
        t = time.time()
        cart = Cartoonizer(args.models, "anime" if "anime" in styles else styles[0])
        img = np.full((96, 80, 3), 180, dtype=np.uint8)
        out, faces = cart.cartoonize(img)
        m = PersonSegmenter(os.path.join(args.models, "u2net", "u2net_human_seg.onnx")).mask(img)
        m2 = AnimeSegmenter(os.path.join(args.models, "animeseg", "isnetis.onnx")).mask(out[:, :, ::-1])
        info.update(ok=bool(out.shape == img.shape and m.shape == img.shape[:2] and m2.shape == img.shape[:2]), secs=round(time.time() - t, 3))
    except StylizeError as exc:
        info.update(code=exc.code, message=str(exc))
    except Exception as exc:
        info.update(code="DOCTOR_FAILED", message=str(exc)[:400], trace=traceback.format_exc()[-1200:])
    REAL_STDOUT.write(json.dumps(info, ensure_ascii=True) + "\n")
    REAL_STDOUT.flush()
    return 0 if info.get("ok") else 1


def main():
    ap = argparse.ArgumentParser(description="photo -> anime likeness with a transparent background")
    ap.add_argument("--doctor", action="store_true")
    ap.add_argument("--models", required=True, help="install folder 'models' (holds dctnet/ and u2net/)")
    ap.add_argument("--style", default="anime")
    ap.add_argument("--input", default="")
    ap.add_argument("--output", default="")
    ap.add_argument("--max-side", type=int, default=1280)
    ap.add_argument("--allow-no-face", action="store_true")
    args = ap.parse_args()
    if args.doctor:
        return run_doctor(args)
    if not args.input or not args.output:
        emit({"event": "error", "code": "BAD_ARGS", "message": "--input and --output are required"})
        return 2
    try:
        return run_stylize(args)
    except StylizeError as exc:
        emit({"event": "error", "code": exc.code, "message": str(exc)})
        return 2 if exc.code in ("BAD_IMAGE", "NO_FACE", "NO_PERSON") else 1
    except Exception as exc:
        emit({"event": "error", "code": "STYLIZE_FAILED", "message": str(exc)[:400], "trace": traceback.format_exc()[-1500:]})
        return 1


if __name__ == "__main__":
    sys.exit(main())
