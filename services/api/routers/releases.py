from typing import Any, Dict, List

from fastapi import APIRouter

from ..clients.observations import discover_collections, is_cube_collection, is_deep_collection, release_label

router = APIRouter(tags=["releases"])

# Descriptions come from the IRSA SPHEREx Archive User Guide (data releases page). Which collections exist
# is discovered from IRSA at run time; only the display text lives here.
RELEASE_TEXT = {
    "DR1": {"surveys": "Surveys 1 and 2 (first year), reprocessed with the QR3 pipeline and calibration",
            "doi": "10.26131/IRSA678", "cube_doi": "10.26131/IRSA679"},
    "QR3": {"surveys": "Surveys 3 and 4 (second year), released weekly since September 2026", "doi": None},
}

ACKNOWLEDGEMENT = (
    "This publication makes use of data products from the Spectro-Photometer for the History of the Universe, "
    "Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion Laboratory "
    "and the California Institute of Technology, and is funded by the National Aeronautics and Space Administration."
)


@router.get("/api/releases")
async def releases() -> Dict[str, Any]:
    names = await discover_collections()
    items: List[Dict[str, Any]] = []
    for c in names:
        label = release_label(c)
        base = label.split(" ")[0]
        info = RELEASE_TEXT.get(base, {})
        cube = is_cube_collection(c)
        items.append({
            "collection": c, "label": label, "is_cube": cube, "is_deep": is_deep_collection(c),
            "searchable_by_default": not cube and not is_deep_collection(c),
            "surveys": info.get("surveys"),
            "citation": (f"DOI {info.get('cube_doi')}" if cube and info.get("cube_doi")
                         else (f"DOI {info['doi']}" if info.get("doi") else "NASA/IPAC IRSA SPHEREx")),
        })
    return {
        "releases": items,
        "default_collections": [i["collection"] for i in items if i["searchable_by_default"]],
        "policy": "DR1 and QR3 supersede QR2 and share one calibration, so they form one time series (the release is "
                  "shown on every frame). QR2 is no longer searchable and QR1 is retired.",
        "acknowledgement": ACKNOWLEDGEMENT,
        "source": "Collections discovered from IRSA (Irsa.list_collections, servicetype SIA, filter spherex)",
        "timeline": [
            {"release": "QR1", "date": "July 2025", "status": "retired in February 2026"},
            {"release": "QR2", "date": "October 2025", "status": "superseded; not searchable; downloads until February 2027"},
            {"release": "QR3", "date": "September 2026", "status": "current (weekly)"},
            {"release": "DR1", "date": "November 2026", "status": "current"},
            {"release": "High Reliability Source Catalog V1", "date": "August 2027", "status": "planned"},
            {"release": "DR2", "date": "December 2027", "status": "planned"},
        ],
    }
