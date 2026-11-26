import asyncio
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.config import LANGUAGE_EXTENSIONS, REPOS_DIR
from app.database import (
    get_analysis_blob,
    get_project,
    init_db,
    list_projects,
    save_analysis,
    update_project_status,
    upsert_project,
)
from app.models.schemas import (
    ChatRequest,
    ChatResponse,
    FileContentResponse,
    GitHubImportRequest,
    GraphNode,
    ImpactReport,
    ProjectResponse,
)
from app.services.analyzer import analyze_repository, compute_impact_analysis
from app.services.demo_repo import materialize_demo_repo
from app.services.extractor import ExtractionError, download_github_repo, safe_extract_zip_bytes
from app.services.tutor import answer_codebase_question
from app.ws import ws_manager

app = FastAPI(
    title="Codebase Intelligence & Visualisation Platform API",
    version="1.0.0",
    description="Team Eternals — Static AST, Dependency, Call Graph, Impact & AI Tutor Engine",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _run_analysis_pipeline(project_id: str, project_name: str, root_path: Path, is_demo: bool = False) -> None:
    async def progress_cb(stage: str, pct: int, detail: str) -> None:
        await ws_manager.broadcast(
            project_id,
            {"project_id": project_id, "stage": stage, "progress": pct, "detail": detail},
        )

    try:
        update_project_status(project_id, "processing", _now_iso())
        result = await analyze_repository(
            project_id=project_id,
            project_name=project_name,
            root_path=root_path,
            is_demo=is_demo,
            progress_cb=progress_cb,
        )
        save_analysis(
            project_id=project_id,
            summary=result["summary"],
            graph=result["graph"],
            dependencies=result["dependencies"],
            call_graph=result["call_graph"],
            execution_flow=result["execution_flow"],
            files=result["files"],
            created_at=_now_iso(),
        )
        update_project_status(project_id, "completed", _now_iso())
        await ws_manager.broadcast(
            project_id,
            {"project_id": project_id, "stage": "completed", "progress": 100, "detail": "Analysis ready."},
        )
    except Exception as exc:
        update_project_status(project_id, "failed", _now_iso(), str(exc))
        await ws_manager.broadcast(
            project_id,
            {"project_id": project_id, "stage": "failed", "progress": 0, "detail": str(exc)},
        )
        raise


@app.get("/api/health")
def health_check() -> Dict[str, Any]:
    return {"status": "ok", "service": "codebase-intelligence-api", "timestamp": _now_iso()}


@app.get("/api/projects", response_model=List[ProjectResponse])
def get_all_projects() -> List[Dict[str, Any]]:
    return list_projects()


@app.get("/api/projects/{project_id}", response_model=ProjectResponse)
def get_single_project(project_id: str) -> Dict[str, Any]:
    proj = get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found.")
    return proj


@app.post("/api/projects/demo", response_model=ProjectResponse)
async def create_and_analyze_demo() -> Dict[str, Any]:
    project_id = f"demo-{uuid.uuid4().hex[:8]}"
    project_name = "FinPulse Payment & Ledger (Demo)"
    root_path = REPOS_DIR / project_id
    now = _now_iso()

    upsert_project(
        {
            "id": project_id,
            "name": project_name,
            "source_type": "demo",
            "source_url": None,
            "status": "processing",
            "created_at": now,
            "updated_at": now,
            "root_path": str(root_path),
            "error_message": None,
            "is_demo": True,
        }
    )

    materialize_demo_repo(root_path)
    await _run_analysis_pipeline(project_id, project_name, root_path, is_demo=True)
    proj = get_project(project_id)
    assert proj is not None
    return proj


@app.post("/api/projects/upload", response_model=ProjectResponse)
async def upload_zip_project(file: UploadFile = File(...)) -> Dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Please upload a valid .zip repository archive.")

    raw_bytes = await file.read()
    project_id = f"zip-{uuid.uuid4().hex[:10]}"
    project_name = Path(file.filename).stem or "uploaded-repository"
    root_path = REPOS_DIR / project_id
    now = _now_iso()

    upsert_project(
        {
            "id": project_id,
            "name": project_name,
            "source_type": "zip",
            "source_url": None,
            "status": "processing",
            "created_at": now,
            "updated_at": now,
            "root_path": str(root_path),
            "error_message": None,
            "is_demo": False,
        }
    )

    try:
        safe_extract_zip_bytes(raw_bytes, root_path)
    except ExtractionError as exc:
        update_project_status(project_id, "failed", _now_iso(), str(exc))
        raise HTTPException(status_code=400, detail=str(exc))

    await _run_analysis_pipeline(project_id, project_name, root_path, is_demo=False)
    proj = get_project(project_id)
    assert proj is not None
    return proj


@app.post("/api/projects/github", response_model=ProjectResponse)
async def import_github_project(payload: GitHubImportRequest) -> Dict[str, Any]:
    project_id = f"gh-{uuid.uuid4().hex[:10]}"
    root_path = REPOS_DIR / project_id
    now = _now_iso()

    upsert_project(
        {
            "id": project_id,
            "name": payload.url,
            "source_type": "github",
            "source_url": payload.url,
            "status": "processing",
            "created_at": now,
            "updated_at": now,
            "root_path": str(root_path),
            "error_message": None,
            "is_demo": False,
        }
    )

    try:
        repo_name = await download_github_repo(payload.url, root_path, branch=payload.branch)
    except ExtractionError as exc:
        update_project_status(project_id, "failed", _now_iso(), str(exc))
        raise HTTPException(status_code=400, detail=str(exc))

    upsert_project(
        {
            "id": project_id,
            "name": repo_name,
            "source_type": "github",
            "source_url": payload.url,
            "status": "processing",
            "created_at": now,
            "updated_at": _now_iso(),
            "root_path": str(root_path),
            "error_message": None,
            "is_demo": False,
        }
    )

    await _run_analysis_pipeline(project_id, repo_name, root_path, is_demo=False)
    proj = get_project(project_id)
    assert proj is not None
    return proj


def _require_analysis(project_id: str) -> Dict[str, Any]:
    proj = get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found.")
    blob = get_analysis_blob(project_id)
    if not blob:
        raise HTTPException(status_code=409, detail=f"Analysis not ready (status: {proj['status']}).")
    return blob


@app.get("/api/projects/{project_id}/analysis")
def get_project_analysis(project_id: str) -> Dict[str, Any]:
    return _require_analysis(project_id)["summary"]


@app.get("/api/projects/{project_id}/graph")
def get_project_graph(project_id: str) -> Dict[str, Any]:
    return _require_analysis(project_id)["graph"]


@app.get("/api/projects/{project_id}/dependencies")
def get_project_dependencies(project_id: str) -> Dict[str, Any]:
    return _require_analysis(project_id)["dependencies"]


@app.get("/api/projects/{project_id}/call-graph")
def get_project_call_graph(project_id: str) -> Dict[str, Any]:
    return _require_analysis(project_id)["call_graph"]


@app.get("/api/projects/{project_id}/execution-flow")
def get_project_execution_flow(project_id: str) -> Dict[str, Any]:
    return _require_analysis(project_id)["execution_flow"]


@app.get("/api/projects/{project_id}/files")
def get_project_files(project_id: str) -> Dict[str, Any]:
    return _require_analysis(project_id)["files"]


@app.get("/api/projects/{project_id}/files/content", response_model=FileContentResponse)
def get_project_file_content(project_id: str, path: str = Query(..., min_length=1)) -> FileContentResponse:
    proj = get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found.")
    blob = _require_analysis(project_id)

    root = Path(proj["root_path"]).resolve()
    target = (root / path).resolve()
    if not str(target).startswith(str(root)):
        raise HTTPException(status_code=403, detail="Access outside repository root is forbidden.")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail=f"File '{path}' not found.")

    try:
        content = target.read_text(encoding="utf-8", errors="ignore")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Unable to read file: {exc}")

    norm_path = path.replace("\\", "/")
    symbols = [
        GraphNode(**n)
        for n in blob["graph"]["nodes"]
        if n["file_path"] == norm_path and n["type"] in {"class", "function", "method"}
    ]
    lang = LANGUAGE_EXTENSIONS.get(target.suffix.lower(), "Plain Text")
    return FileContentResponse(
        path=norm_path,
        language=lang,
        content=content,
        lines=len(content.splitlines()),
        symbols=symbols,
    )


@app.get("/api/projects/{project_id}/impact", response_model=ImpactReport)
def get_project_impact(project_id: str, node_id: str = Query(..., min_length=1)) -> ImpactReport:
    blob = _require_analysis(project_id)
    try:
        return compute_impact_analysis(blob["graph"], node_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.post("/api/projects/{project_id}/chat", response_model=ChatResponse)
async def chat_with_codebase(project_id: str, payload: ChatRequest) -> ChatResponse:
    proj = get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found.")
    blob = _require_analysis(project_id)
    history = [{"role": m.role, "content": m.content} for m in payload.history]
    return await answer_codebase_question(
        question=payload.question,
        root_path=Path(proj["root_path"]),
        analysis_blob=blob,
        history=history,
        focus_node_id=payload.focus_node_id,
    )


@app.websocket("/ws/projects/{project_id}")
async def project_progress_ws(websocket: WebSocket, project_id: str) -> None:
    await ws_manager.connect(project_id, websocket)
    try:
        while True:
            await asyncio.sleep(15)
            await websocket.send_json({"type": "heartbeat"})
    except WebSocketDisconnect:
        ws_manager.disconnect(project_id, websocket)
    except Exception:
        ws_manager.disconnect(project_id, websocket)
