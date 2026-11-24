# Vendored: Talking Head(?) Anime from a Single Image 3 — inference code

Source: https://github.com/pkhungurn/talking-head-anime-3-demo (branch `main`, package `tha3/`), copyright (c) 2022
Pramook Khungurn, MIT License (see `LICENSE` in this folder).

Only the inference part is kept: `tha3/__init__.py`, `util.py`, `compute/`, `module/`, `nn/`, `poser/`. The GUI and
motion-capture apps (`tha3/app/`, `tha3/mocap/`), the notebooks and the sample images are not included.

Changes made for the DSH Video Workbench (marked `DSH:` in the code):

- `util.py`: `matplotlib` is imported lazily inside the visualisation helper (inference does not need matplotlib);
  `torch_load` loads with `map_location='cpu', weights_only=True` (weights also load on computers without a GPU, and
  only plain tensors are accepted).
- `nn/editor/editor_07.py`: `matplotlib` is imported lazily inside the `show_image` debug helper.

The model weights are NOT part of this repository. The optional installer (`packages/dsh-tool-avatar/anime-installer.js`)
downloads the author's unmodified files (SHA-256 checked). They are licensed under Creative Commons Attribution 4.0
International by Pramook Khungurn — see `packages/dsh-tool-avatar/ANIME-NOTICE.md` for the attribution text.
