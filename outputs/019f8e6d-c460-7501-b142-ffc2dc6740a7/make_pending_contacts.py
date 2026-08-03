import json
from pathlib import Path

from PIL import Image, ImageDraw


BASE = Path(r"E:\新AI工具人\outputs\019f8e6d-c460-7501-b142-ffc2dc6740a7")
CROPS = BASE / "registry_card_crops"
DATA = json.loads((BASE / "registry_records.json").read_text(encoding="utf-8"))
OUT = Path(r"C:\Users\Administrator\AppData\Local\Temp\registry_pending_contacts")
OUT.mkdir(parents=True, exist_ok=True)

pending = [row for row in DATA["occurrences"] if "待确认" in row["recognition_note"]]
batch_size = 8

for batch_index in range(0, len(pending), batch_size):
    batch = pending[batch_index : batch_index + batch_size]
    tiles = []
    for row in batch:
        name = f"{row['source_index']:02d}_{row['card_index']:03d}.png"
        image = Image.open(CROPS / name).convert("RGB")
        width = 700
        height = int(image.height * width / image.width)
        image = image.resize((width, height))
        tile = Image.new("RGB", (width, height + 36), "white")
        tile.paste(image, (0, 36))
        ImageDraw.Draw(tile).text((8, 8), name, fill="black")
        tiles.append(tile)

    row_height = max(tile.height for tile in tiles)
    contact = Image.new("RGB", (1400, row_height * 4), "white")
    for index, tile in enumerate(tiles):
        contact.paste(tile, ((index % 2) * 700, (index // 2) * row_height))
    contact.save(OUT / f"pending_{batch_index // batch_size + 1:02d}.png")

print(len(pending), len(list(OUT.glob("pending_*.png"))))
