import asyncio
from typing import Any, Dict, Optional

from fastapi import APIRouter, Query

from ..astro.render import common_grid, grid_pixel_of
from ..clients.gaia import query_gaia_sources
from ..clients.http import UpstreamError
from ..clients.wise import query_wise_sources

router = APIRouter(tags=["overlays"])


@router.get("/api/overlays")
async def overlays(
    ra: float = Query(..., description="Field centre RA (same centre as the frames)"),
    dec: float = Query(...),
    size: float = Query(0.1, ge=0.04, le=0.3, description="Field side in degrees (same as the frames)"),
    epoch: float = Query(2026.0, description="Epoch to which Gaia positions are propagated (the frame date)"),
    g_limit: float = Query(18.0, ge=8.0, le=21.0, description="Gaia G magnitude limit"),
):
    """Gaia DR3 and AllWISE sources in the field, with pixel positions on the common frame grid.
    Each catalogue reports its own status, so one slow archive never hides the other."""
    radius = size * 0.75
    grid, shape = common_grid(ra, dec, size)

    async def gaia() -> Dict[str, Any]:
        try:
            rows = await query_gaia_sources(ra, dec, radius, target_epoch=epoch, max_rows=500, g_limit=g_limit)
            for r in rows:
                gx, gy = grid_pixel_of(grid, r["ra"], r["dec"], shape)
                r["grid_x"], r["grid_y"] = round(gx, 2), round(gy, 2)
            rows = [r for r in rows if -2 <= r["grid_x"] < shape[1] + 2 and -2 <= r["grid_y"] < shape[0] + 2]
            return {"ok": True, "count": len(rows), "sources": rows,
                    "credit": "ESA Gaia DR3. Positions propagated from the catalogue epoch 2016.0 with Gaia proper motions.",
                    "note": "Gaia is optical only (about 330-1050 nm): positions and motions, not fluxes comparable to SPHEREx."}
        except UpstreamError as exc:
            return {"ok": False, "error": str(exc), "sources": [], "count": 0}

    async def wise() -> Dict[str, Any]:
        try:
            rows = await query_wise_sources(ra, dec, radius, max_rows=200)
            for r in rows:
                gx, gy = grid_pixel_of(grid, r["ra"], r["dec"], shape)
                r["grid_x"], r["grid_y"] = round(gx, 2), round(gy, 2)
            rows = [r for r in rows if -2 <= r["grid_x"] < shape[1] + 2 and -2 <= r["grid_y"] < shape[0] + 2]
            return {"ok": True, "count": len(rows), "sources": rows,
                    "credit": "AllWISE Source Catalog (NASA/IPAC IRSA), positions at the mean epoch about 2010.5.",
                    "note": "Positions are NOT propagated: fast movers appear displaced from where they are now."}
        except UpstreamError as exc:
            return {"ok": False, "error": str(exc), "sources": [], "count": 0}

    g, w = await asyncio.gather(gaia(), wise())
    return {"ra": ra, "dec": dec, "size_deg": size, "epoch": epoch,
            "grid": {"width_px": shape[1], "height_px": shape[0], "pixel_scale_arcsec": 3.075,
                     "orientation": "north up, east left"},
            "gaia": g, "wise": w}
