from fastapi import APIRouter, HTTPException, Query, Response

from ..astro.coordinates import propagate_proper_motion
from ..clients.context import DSS_EPOCH_RANGE, DSS_NOMINAL_EPOCH, dss_png, query_neossat
from ..clients.http import UpstreamError

router = APIRouter(tags=["context"])


@router.get("/api/context/dss.png")
async def dss_image(
    ra: float = Query(...), dec: float = Query(...), size: float = Query(0.1, ge=0.02, le=0.5),
    pmra: float = Query(0.0), pmdec: float = Query(0.0), epoch: float = Query(2026.0),
    invert: bool = Query(False),
):
    """Historical optical image (DSS2 red, about 1987-1998). Centred where the object WAS at the plate epoch, so a
    moving object sits in the middle and the background stars show how far it has travelled."""
    cra, cdec = propagate_proper_motion(ra, dec, pmra, pmdec, epoch, DSS_NOMINAL_EPOCH)
    try:
        png = await dss_png(cra, cdec, size, invert)
    except UpstreamError as exc:
        raise HTTPException(status_code=503, detail=f"NASA SkyView is busy: {exc}")
    return Response(content=png, media_type="image/png", headers={
        "X-Hanos-Survey": "DSS2 red", "X-Hanos-Epoch": DSS_EPOCH_RANGE, "Cache-Control": "public, max-age=86400"})


@router.get("/api/context/dss")
async def dss_info(
    ra: float = Query(...), dec: float = Query(...), size: float = Query(0.1, ge=0.02, le=0.5),
    pmra: float = Query(0.0), pmdec: float = Query(0.0), epoch: float = Query(2026.0),
):
    cra, cdec = propagate_proper_motion(ra, dec, pmra, pmdec, epoch, DSS_NOMINAL_EPOCH)
    return {
        "survey": "Digitized Sky Survey 2, red (POSS-II F) via NASA SkyView",
        "epoch": DSS_EPOCH_RANGE,
        "nominal_epoch_used_for_centering": DSS_NOMINAL_EPOCH,
        "centre_ra": cra, "centre_dec": cdec,
        "baseline_years_to_spherex": round(epoch - DSS_NOMINAL_EPOCH, 1),
        "wavelength_regime": "optical (red photographic plates)",
        "credit": "Digitized Sky Survey: STScI, Caltech and AAO plates, distributed by NASA SkyView and CADC.",
        "note": "Optical context from a different mission and epoch. Brown dwarfs such as WISE 0855 are invisible in optical light.",
        "image_url": f"/api/context/dss.png?ra={ra}&dec={dec}&size={size}&pmra={pmra}&pmdec={pmdec}&epoch={epoch}",
    }


@router.get("/api/context/neossat")
async def neossat(ra: float = Query(...), dec: float = Query(...), radius: float = Query(0.1, ge=0.01, le=1.0)):
    try:
        return await query_neossat(ra, dec, radius)
    except UpstreamError as exc:
        raise HTTPException(status_code=503, detail=f"CADC is busy: {exc}")


@router.get("/api/context/ssois")
async def ssois():
    return {
        "name": "CADC Solar System Object Image Search (SSOIS)",
        "url": "https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/ssois/",
        "programmatic": False,
        "note": "SSOIS has no public REST interface that we could confirm, so it is offered as a link only. "
                "Use the MOST search (/api/moving) for SPHEREx frames that contain a known object.",
        "citation": "Gwyn, Hill and Kavelaars (2012)",
    }
