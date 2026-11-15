from fastapi import APIRouter, HTTPException, Query

from ..clients.http import UpstreamError
from ..clients.most import query_moving_objects

router = APIRouter(tags=["moving"])


@router.get("/api/moving")
async def moving(
    name: str = Query(..., description="Solar-system object name, for example Pallas, Ceres, Apophis or 29P"),
    from_date: str = Query("2025 05 01", description="yyyy mm dd"),
    to_date: str = Query("2026 12 31", description="yyyy mm dd"),
):
    """Real SPHEREx frames that contain the named object (IRSA MOST), with its predicted position in each."""
    try:
        return await query_moving_objects(name, from_date, to_date)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except UpstreamError as exc:
        raise HTTPException(status_code=503, detail=f"IRSA MOST is busy: {exc}")
