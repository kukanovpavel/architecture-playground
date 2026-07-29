from fastapi import APIRouter

from ..catalog import CATALOG, CATEGORIES

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("")
def get_catalog():
    return {"categories": CATEGORIES, "types": CATALOG}
