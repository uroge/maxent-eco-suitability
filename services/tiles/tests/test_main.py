import importlib
from pathlib import Path

import numpy
import pytest
import rasterio
from fastapi import HTTPException
from fastapi.testclient import TestClient
from rasterio.io import MemoryFile
from rasterio.shutil import copy as copy_raster
from rasterio.transform import from_bounds

ANALYSIS_ID = "an_0123456789abcdef0123456789abcdef"
SECRET = "a" * 32


def client(monkeypatch) -> TestClient:
    monkeypatch.setenv("STORAGE_BUCKET", "ecosuitability")
    monkeypatch.setenv("TILE_INTERNAL_SHARED_SECRET", SECRET)
    module = importlib.import_module("app.main")
    return TestClient(module.app)


@pytest.fixture
def raster_fixtures(tmp_path: Path, monkeypatch) -> dict[str, str]:
    module = importlib.import_module("app.main")
    width = 256
    height = 128
    transform = from_bounds(-180, -85.05112878, 180, 85.05112878, width, height)
    arrays = {
        "suitability": numpy.tile(numpy.linspace(0, 1, width, dtype="float32"), (height, 1)),
        "threshold": numpy.tile(
            numpy.concatenate([numpy.zeros(width // 2), numpy.ones(width // 2)]).astype("uint8"),
            (height, 1),
        ),
        "predictor": numpy.full((height, width), 123.25, dtype="float32"),
        "terrain": numpy.full((height, width), 250.0, dtype="float32"),
    }
    arrays["suitability"][:16, :16] = -9999
    paths: dict[str, str] = {}
    keys: dict[str, str] = {}
    for name, data in arrays.items():
        source = tmp_path / f"{name}-source.tif"
        target = tmp_path / f"{name}.tif"
        nodata = 255 if name == "threshold" else -9999
        with rasterio.open(
            source,
            "w",
            driver="GTiff",
            width=width,
            height=height,
            count=1,
            dtype=data.dtype,
            crs="EPSG:4326",
            transform=transform,
            nodata=nodata,
            tiled=True,
            compress="DEFLATE",
        ) as dataset:
            dataset.write(data, 1)
        copy_raster(
            source,
            target,
            driver="COG",
            compress="DEFLATE",
            overview_count=1,
            overview_resampling="nearest" if name == "threshold" else "average",
        )
        with rasterio.open(target) as cog:
            assert cog.tags(ns="IMAGE_STRUCTURE")["LAYOUT"] == "COG"
            assert cog.compression.name == "deflate"
            assert cog.nodata == nodata
            assert cog.overviews(1)
        key = f"analyses/{ANALYSIS_ID}/map-assets/{name}.tif"
        keys[name] = key
        paths[key] = str(target)
    monkeypatch.setattr(module, "source_path", lambda key: paths[key])
    return keys


def get_tile(test_client: TestClient, style: str, key: str):
    params = {"key": key}
    if style == "predictor":
        params.update({"minimum": 100, "maximum": 150})
    return test_client.get(
        f"/v1/tiles/{style}/0/0/0.png",
        params=params,
        headers={"x-tile-secret": SECRET},
    )


def test_health_is_public(monkeypatch) -> None:
    response = client(monkeypatch).get("/health/live")
    assert response.status_code == 200


def test_tile_boundary_hides_auth_failures(monkeypatch) -> None:
    response = client(monkeypatch).get("/v1/tiles/suitability/0/0/0.png", params={"key": "x"})
    assert response.status_code == 404


def test_object_keys_are_scoped() -> None:
    module = importlib.import_module("app.main")
    with pytest.raises(HTTPException) as captured:
        module.source_path("../../etc/passwd")
    assert captured.value.status_code == 400


@pytest.mark.parametrize(
    ("style", "fixture"),
    [("suitability", "suitability"), ("threshold", "threshold"), ("predictor", "predictor")],
)
def test_cog_tile_styles(monkeypatch, raster_fixtures, style: str, fixture: str) -> None:
    response = get_tile(client(monkeypatch), style, raster_fixtures[fixture])
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"].startswith("private")
    with MemoryFile(response.content) as memory:
        with memory.open() as image:
            assert image.width == 256
            assert image.height == 256


def test_nodata_is_transparent(monkeypatch, raster_fixtures) -> None:
    response = get_tile(client(monkeypatch), "suitability", raster_fixtures["suitability"])
    with MemoryFile(response.content) as memory:
        with memory.open() as image:
            assert image.dataset_mask().min() == 0


def test_point_sampling_reads_predictor_value(monkeypatch, raster_fixtures) -> None:
    response = client(monkeypatch).get(
        "/v1/point",
        params={"key": raster_fixtures["predictor"], "longitude": 0, "latitude": 0},
        headers={"x-tile-secret": SECRET},
    )
    assert response.status_code == 200
    assert response.json()["values"][0] == pytest.approx(123.25)


def test_point_sampling_returns_null_for_nodata(monkeypatch, raster_fixtures) -> None:
    response = client(monkeypatch).get(
        "/v1/point",
        params={
            "key": raster_fixtures["suitability"],
            "longitude": -175,
            "latitude": 80,
        },
        headers={"x-tile-secret": SECRET},
    )
    assert response.status_code == 200
    assert response.json()["values"][0] is None


def test_predictor_requires_server_controlled_range(monkeypatch, raster_fixtures) -> None:
    response = client(monkeypatch).get(
        "/v1/tiles/predictor/0/0/0.png",
        params={"key": raster_fixtures["predictor"]},
        headers={"x-tile-secret": SECRET},
    )
    assert response.status_code == 400


def test_terrain_rgb_encodes_elevation(monkeypatch, raster_fixtures) -> None:
    response = get_tile(client(monkeypatch), "terrainrgb", raster_fixtures["terrain"])
    assert response.status_code == 200
    with MemoryFile(response.content) as memory:
        with memory.open() as image:
            red, green, blue = image.read((1, 2, 3))[:, 128, 128]
    elevation = ((int(red) * 256 * 256 + int(green) * 256 + int(blue)) / 10) - 10000
    assert elevation == pytest.approx(250.0, abs=0.1)
