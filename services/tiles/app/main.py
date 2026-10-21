from __future__ import annotations

import hmac
import os
import re
from typing import Annotated, Literal

import numpy
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response
from rio_tiler.colormap import cmap
from rio_tiler.io import COGReader
from rio_tiler.utils import render

OBJECT_KEY = re.compile(r"^analyses/an_[a-z0-9]{32}/(?:results|map-assets)/[A-Za-z0-9._/-]+$")
MAX_TILE_BYTES = 2 * 1024 * 1024


def require_secret(x_tile_secret: Annotated[str | None, Header()] = None) -> None:
    expected = os.environ.get("TILE_INTERNAL_SHARED_SECRET", "")
    if not expected or not x_tile_secret or not hmac.compare_digest(expected, x_tile_secret):
        raise HTTPException(status_code=404, detail="Not found")


def source_path(key: str) -> str:
    if not OBJECT_KEY.fullmatch(key) or ".." in key:
        raise HTTPException(status_code=400, detail="Invalid object key")
    bucket = os.environ["STORAGE_BUCKET"]
    return f"/vsis3/{bucket}/{key}"


def terrain_rgb(data: numpy.ndarray) -> numpy.ndarray:
    encoded = numpy.clip(numpy.rint((data + 10000.0) * 10.0), 0, 16777215).astype(
        numpy.uint32
    )
    return numpy.stack(
        [encoded >> 16, (encoded >> 8) & 255, encoded & 255], axis=0
    ).astype(numpy.uint8)


app = FastAPI(
    title="EcoSuitability Tiles",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.get("/health/live")
def live() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready")
def ready() -> dict[str, str]:
    required = ["STORAGE_BUCKET", "TILE_INTERNAL_SHARED_SECRET"]
    if any(not os.environ.get(name) for name in required):
        raise HTTPException(status_code=503, detail="Configuration unavailable")
    return {"status": "ok"}


@app.get("/v1/tiles/{style}/{z}/{x}/{y}.png", dependencies=[Depends(require_secret)])
def tile(
    style: Literal["suitability", "threshold", "predictor", "terrainrgb"],
    z: int,
    x: int,
    y: int,
    key: Annotated[str, Query(min_length=1, max_length=1024)],
    minimum: Annotated[float | None, Query()] = None,
    maximum: Annotated[float | None, Query()] = None,
) -> Response:
    if z < 0 or z > 22 or x < 0 or y < 0 or x >= 2**z or y >= 2**z:
        raise HTTPException(status_code=400, detail="Invalid tile coordinates")
    with COGReader(source_path(key)) as cog:
        image = cog.tile(x, y, z, tilesize=256)
    if style == "terrainrgb":
        content = render(terrain_rgb(image.data[0]), mask=image.mask, img_format="PNG")
    elif style == "threshold":
        content = render(
            image.data.astype(numpy.uint8),
            mask=image.mask,
            img_format="PNG",
            colormap={0: (245, 245, 245, 255), 1: (33, 145, 140, 255)},
        )
    else:
        if style == "predictor" and (
            minimum is None or maximum is None or not minimum < maximum
        ):
            raise HTTPException(status_code=400, detail="Predictor range is required")
        value_range = (0.0, 1.0) if style == "suitability" else (minimum, maximum)
        rescaled = image.rescale(in_range=(value_range,))
        content = render(
            rescaled.data,
            mask=rescaled.mask,
            img_format="PNG",
            colormap=cmap.get("viridis"),
        )
    if len(content) > MAX_TILE_BYTES:
        raise HTTPException(status_code=502, detail="Tile response exceeds limit")
    return Response(
        content,
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=300"},
    )


@app.get("/v1/point", dependencies=[Depends(require_secret)])
def point(
    key: Annotated[str, Query(min_length=1, max_length=1024)],
    longitude: Annotated[float, Query(ge=-180, le=180)],
    latitude: Annotated[float, Query(ge=-90, le=90)],
) -> dict[str, object]:
    with COGReader(source_path(key)) as cog:
        value = cog.point(longitude, latitude, coord_crs="epsg:4326")
    data = numpy.asarray(value.data).reshape(-1)
    mask = numpy.asarray(value.mask).reshape(-1)
    values = [
        float(item)
        if mask.size > 0
        and bool(mask[index if mask.size > 1 else 0])
        and numpy.isfinite(item)
        else None
        for index, item in enumerate(data)
    ]
    return {"coordinates": [longitude, latitude], "values": values}
