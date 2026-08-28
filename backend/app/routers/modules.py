"""Which modules exist, and which are usable.

The frontend needs to know whether a module has an agent before offering to
open a session against it — otherwise the only way to find out is to try, and
get a failure the user cannot act on.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..deps import require_api_key
from ..modules import all_modules, is_provisioned
from ..schemas import ModuleInfo

router = APIRouter(
    prefix="/modules", tags=["modules"], dependencies=[Depends(require_api_key)]
)


@router.get("", response_model=list[ModuleInfo])
def list_modules() -> list[ModuleInfo]:
    return [
        ModuleInfo(
            id=m.id,
            name=m.name,
            domain=m.domain,
            provisioned=is_provisioned(m.id),
        )
        for m in all_modules()
    ]
