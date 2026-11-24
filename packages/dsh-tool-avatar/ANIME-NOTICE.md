# 动漫形象数字人 · 本地模型的来源与署名 (third-party notices)

The optional local models of the anime presenter (`anime-installer.js` / `anime-local.js`) are downloaded by the user's
own computer from the authors' official hosts (or from mirrors whose files are byte-identical — every file is checked
against a pinned SHA-256). None of these model files is part of this repository.

## Attribution text to show in the UI and the README (required by CC BY 4.0)

中文：

> 动作模型：Talking Head(?) Anime from a Single Image 3，作者 Pramook Khungurn。模型权重采用知识共享「署名 4.0 国际」
> 许可（CC BY 4.0，https://creativecommons.org/licenses/by/4.0/），代码采用 MIT 许可。
> 来源：https://github.com/pkhungurn/talking-head-anime-3-demo 。模型文件未作任何修改，按“原样”提供，不附带任何担保。

English:

> Motion model: "Talking Head(?) Anime from a Single Image 3: Now the Body Too" by Pramook Khungurn. Model weights
> licensed under the Creative Commons Attribution 4.0 International License
> (https://creativecommons.org/licenses/by/4.0/); code under the MIT License.
> Source: https://github.com/pkhungurn/talking-head-anime-3-demo. The model files are used unmodified and are provided
> "as is", without warranties of any kind.

Short form (status line / credits): `Talking Head Anime 3 © Pramook Khungurn · CC BY 4.0`

Suggested citation (academic use, from the author's README): Pramook Khungurn. *Talking Head(?) Anime from a Single
Image 3: Now the Body Too.* http://pkhungurn.github.io/talking-head-anime-3/, 2022.

## Components

| Part | Author / source | Licence | How it is used |
|---|---|---|---|
| THA3 model weights (`standard_float`, `separable_float`) | Pramook Khungurn — official zip `talking-head-anime-3-models.zip` (Dropbox link in the official README); byte-identical copy on Hugging Face `OktayAlpk/talking-head-anime-3` | CC BY 4.0 (commercial use allowed, attribution required) | downloaded unmodified; `models/tha3/ATTRIBUTION.txt` (+ the official `LICENSE.txt` when the zip route is used) is written next to them |
| THA3 inference code (`scripts/avatar/tha3/`) | Pramook Khungurn, github.com/pkhungurn/talking-head-anime-3-demo | MIT (`scripts/avatar/tha3/LICENSE`) | vendored, inference part only; small changes listed in `scripts/avatar/tha3/NOTICE.md` |
| DCT-Net photo → cartoon models (styles anime / 3d / design) | Men Yifang et al., Alibaba DAMO Academy — ModelScope `iic/cv_unet_person-image-cartoon_compound-models`, `…-cartoon-3d_…`, `…-cartoon-sd-design_…` | Apache-2.0 (code at github.com/menyifang/DCT-Net and the ModelScope weights) | TensorFlow frozen graphs run unmodified; the inference steps in `scripts/avatar/anime_stylize.py` follow the official `source/cartoonize.py` |
| Face detector / landmarks used by DCT-Net (`detector.pb`, `keypoints.pb`) | shipped in the DCT-Net ModelScope folder; from Peppa_Pig_Face_Engine (github.com/610265158/Peppa_Pig_Face_Engine) | Apache-2.0 | run unmodified |
| U²-Net human segmentation (`u2net_human_seg.onnx`) | Xuebin Qin et al. (github.com/xuebinqin/U-2-Net); ONNX export distributed by rembg (Daniel Gatis) | Apache-2.0 (model) · MIT (rembg) | finds the person on the photo |
| Anime character segmentation (`isnetis.onnx`) | SkyTNT, Hugging Face `skytnt/anime-seg` (github.com/SkyTNT/anime-segmentation); rembg ships the same bytes as `isnet-anime.onnx` | Apache-2.0 | traces the outline on the stylized picture |

Notes for the coordinator:

- The DCT-Net model card lists public portrait data (e.g. FFHQ) among its training data; the publisher releases the
  weights under Apache-2.0. As with MuseTalk, mention this if the UI shows licence details.
- The sample pictures of the THA3 repository (`data/images`, Crypko guideline / CC BY-NC) and DCT-Net's `input.png` were
  used only for local tests and are not in this repository.
- Not used anywhere (non-commercial or unclear licences): AnimeGAN, VToonify, Sonic, Wav2Lip, MODNet, RMBG-1.4/2.0,
  DIS `isnet-general-use` (its weights carry no explicit licence; trained on DIS5K with its own terms of use).
