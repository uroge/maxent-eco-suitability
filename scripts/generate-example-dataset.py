from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path

import numpy
import rasterio
from rasterio.transform import from_origin

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "apps" / "web" / "public" / "example"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


OUTPUT.mkdir(parents=True, exist_ok=True)
occurrences = OUTPUT / "synthetic-occurrences.csv"
with occurrences.open("w", newline="", encoding="utf-8") as stream:
    writer = csv.writer(stream, lineterminator="\n")
    writer.writerow(["species", "longitude", "latitude"])
    for index in range(24):
        writer.writerow(["Example species", -5.8 + (index % 6) * 0.35, 49.4 + (index // 6) * 0.3])

predictor = OUTPUT / "synthetic-elevation.tif"
values = numpy.fromfunction(lambda row, column: 80 + row * 4 + column * 2, (32, 32), dtype=numpy.float32).astype("float32")
with rasterio.open(
    predictor,
    "w",
    driver="GTiff",
    width=32,
    height=32,
    count=1,
    dtype="float32",
    crs="EPSG:4326",
    transform=from_origin(-6.5, 51.5, 0.08, 0.08),
    nodata=-9999,
    compress="deflate",
) as dataset:
    dataset.write(values, 1)

files = [occurrences, predictor]
manifest = {
    "schemaVersion": 1,
    "label": "Synthetic example dataset",
    "scientificUse": False,
    "generator": "scripts/generate-example-dataset.py",
    "files": [
        {"filename": path.name, "size": path.stat().st_size, "sha256": sha256(path)}
        for path in files
    ],
}
(OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
