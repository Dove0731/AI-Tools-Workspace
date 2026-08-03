from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
from PIL import Image


SOURCE_DIR = Path(r"C:\Users\Administrator\AppData\Local\Temp")
OUTPUT_DIR = Path(r"E:\新AI工具人\outputs\019f8e6d-c460-7501-b142-ffc2dc6740a7\registry_card_crops")

IMAGE_NAMES = """
codex-clipboard-210d3f46-e852-4d82-bf6f-eeeccea97372.jpg
codex-clipboard-1f7c3005-d21b-4462-b74f-441f07bcaffc.jpg
codex-clipboard-e3586664-99cb-4bf9-a666-10d996c915ba.jpg
codex-clipboard-549a5591-bd7a-4777-962f-fd7e7c0031ee.jpg
codex-clipboard-6215fa46-d2e5-4492-8847-c816e7762b65.jpg
codex-clipboard-d7b1109d-9dff-4e6f-9955-b338ff1f3859.jpg
codex-clipboard-c849d2e2-d645-4589-86b0-9d4679a2bf9b.jpg
codex-clipboard-38b14cb1-9c5b-45d4-a2fd-bb25f899dbf4.jpg
codex-clipboard-7948485c-0c2b-4b05-b71a-fd8847f25199.jpg
codex-clipboard-19c5b1b6-28d1-4f09-a003-40d1d747acfa.jpg
codex-clipboard-1158c1ae-fccc-4beb-9bbe-2bb0ade5b0db.jpg
codex-clipboard-29d715f1-a103-4941-9b97-52a8a0d1eeae.jpg
codex-clipboard-3903e511-0ebf-4335-8a8b-f81c55d2e434.jpg
codex-clipboard-861b8460-5950-4b5b-b93e-088c7d3c5c96.jpg
codex-clipboard-c97ea106-643b-4d51-8e1a-4e77c540ac3d.jpg
codex-clipboard-8ee91a27-a449-46ed-99ad-1d96e8214b31.jpg
codex-clipboard-1c9373e0-b119-4169-9997-67952e07c50b.jpg
codex-clipboard-f299eda1-9867-4033-ac70-a2ac420cb64f.jpg
codex-clipboard-8b2166da-65a9-4032-b16a-42cd4986e91b.jpg
codex-clipboard-d92ba352-5027-4e87-963a-ea19d9f4894a.jpg
codex-clipboard-a94b65bc-676a-4a78-8f48-0880911db2da.jpg
codex-clipboard-23020965-bae4-45cc-8ca2-a59055394f3c.jpg
codex-clipboard-0223abbe-5bac-44ee-a4df-51b273785e37.jpg
codex-clipboard-1274e89a-2eec-455b-8916-4bb027009836.jpg
codex-clipboard-aeb17f00-375e-4a28-9bee-6b1e8bc85610.jpg
codex-clipboard-1ee44cd5-c806-4acd-bbc7-e16d8424a10a.jpg
codex-clipboard-9f15cebd-0b4e-4171-acbb-128f66a88524.jpg
codex-clipboard-7498b99a-431c-4c9a-9fb7-0d967f4fdd7a.jpg
codex-clipboard-5adf37a4-dcdb-4781-8922-ca1a38460825.jpg
codex-clipboard-2bf4d802-abd5-4c84-a8e2-61bc58d6eb11.jpg
""".strip().splitlines()


def separator_bands(image: Image.Image) -> list[tuple[int, int]]:
    arr = np.asarray(image.convert("RGB"))
    core = arr[:, 20:-20, :]
    flat = core.reshape(core.shape[0], -1)
    med = np.median(flat, axis=1)
    std = flat.std(axis=1)
    mask = (med >= 238) & (med <= 252) & (std < 6)

    groups: list[tuple[int, int]] = []
    start = None
    for idx, value in enumerate(mask):
        if value and start is None:
            start = idx
        if start is not None and (not value or idx == len(mask) - 1):
            end = idx if not value else idx + 1
            if 5 <= end - start <= 40 and end > 350:
                groups.append((start, end))
            start = None
    return groups


def card_ranges(image: Image.Image, bands: list[tuple[int, int]]) -> list[tuple[int, int]]:
    height = image.height
    if not bands:
        return [(0, height)]

    starts = [start for start, _ in bands]
    diffs = [b - a for a, b in zip(starts, starts[1:]) if 220 <= b - a <= 750]
    typical = int(np.median(diffs)) if diffs else min(500, bands[0][0])
    first_start = max(0, bands[0][0] - typical)

    ranges: list[tuple[int, int]] = []
    current = first_start
    for start, end in bands:
        if start - current >= 160:
            ranges.append((current, start))
        current = end
    if height - current >= 180:
        ranges.append((current, height))
    return ranges


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = []
    start_index = int(os.environ.get("START_INDEX", "1"))
    end_index = int(os.environ.get("END_INDEX", str(len(IMAGE_NAMES))))

    for source_index, name in enumerate(IMAGE_NAMES, start=1):
        if source_index < start_index or source_index > end_index:
            continue
        source_path = SOURCE_DIR / name
        with Image.open(source_path) as opened:
            image = opened.convert("RGB")
            bands = separator_bands(image)
            ranges = card_ranges(image, bands)
            for card_index, (top, bottom) in enumerate(ranges, start=1):
                crop = image.crop((0, top, image.width, bottom))
                crop_name = f"{source_index:02d}_{card_index:03d}.png"
                crop_path = OUTPUT_DIR / crop_name
                crop.save(crop_path)
                crop.close()
                manifest.append(
                    {
                        "source_index": source_index,
                        "source_name": name,
                        "card_index": card_index,
                        "top": top,
                        "bottom": bottom,
                        "crop_path": str(crop_path),
                    }
                )
            image.close()

    manifest_name = f"manifest_{start_index:02d}_{end_index:02d}.json"
    (OUTPUT_DIR / manifest_name).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps({"images": len(IMAGE_NAMES), "cards": len(manifest)}))


if __name__ == "__main__":
    main()
