import json
import sqlite3
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

from app.config import DB_PATH


def init_db() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                source_type TEXT NOT NULL,
                source_url TEXT,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                root_path TEXT NOT NULL,
                error_message TEXT,
                is_demo INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS analyses (
                project_id TEXT PRIMARY KEY,
                summary_json TEXT NOT NULL,
                graph_json TEXT NOT NULL,
                dependencies_json TEXT NOT NULL,
                call_graph_json TEXT NOT NULL,
                execution_flow_json TEXT NOT NULL,
                files_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
            """
        )
        conn.commit()


@contextmanager
def get_connection():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def upsert_project(project: Dict[str, Any]) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO projects (id, name, source_type, source_url, status, created_at, updated_at, root_path, error_message, is_demo)
            VALUES (:id, :name, :source_type, :source_url, :status, :created_at, :updated_at, :root_path, :error_message, :is_demo)
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name,
                status=excluded.status,
                updated_at=excluded.updated_at,
                root_path=excluded.root_path,
                error_message=excluded.error_message
            """,
            {
                **project,
                "is_demo": 1 if project.get("is_demo") else 0,
            },
        )
        conn.commit()


def update_project_status(project_id: str, status: str, updated_at: str, error_message: Optional[str] = None) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE projects SET status = ?, updated_at = ?, error_message = ? WHERE id = ?",
            (status, updated_at, error_message, project_id),
        )
        conn.commit()


def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not row:
            return None
        d = dict(row)
        d["is_demo"] = bool(d["is_demo"])
        return d


def list_projects() -> List[Dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM projects ORDER BY updated_at DESC").fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["is_demo"] = bool(d["is_demo"])
            result.append(d)
        return result


def save_analysis(
    project_id: str,
    summary: Dict[str, Any],
    graph: Dict[str, Any],
    dependencies: Dict[str, Any],
    call_graph: Dict[str, Any],
    execution_flow: Dict[str, Any],
    files: Dict[str, Any],
    created_at: str,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO analyses (project_id, summary_json, graph_json, dependencies_json, call_graph_json, execution_flow_json, files_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(project_id) DO UPDATE SET
                summary_json=excluded.summary_json,
                graph_json=excluded.graph_json,
                dependencies_json=excluded.dependencies_json,
                call_graph_json=excluded.call_graph_json,
                execution_flow_json=excluded.execution_flow_json,
                files_json=excluded.files_json,
                created_at=excluded.created_at
            """,
            (
                project_id,
                json.dumps(summary),
                json.dumps(graph),
                json.dumps(dependencies),
                json.dumps(call_graph),
                json.dumps(execution_flow),
                json.dumps(files),
                created_at,
            ),
        )
        conn.commit()


def get_analysis_blob(project_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM analyses WHERE project_id = ?", (project_id,)).fetchone()
        if not row:
            return None
        return {
            "project_id": row["project_id"],
            "summary": json.loads(row["summary_json"]),
            "graph": json.loads(row["graph_json"]),
            "dependencies": json.loads(row["dependencies_json"]),
            "call_graph": json.loads(row["call_graph_json"]),
            "execution_flow": json.loads(row["execution_flow_json"]),
            "files": json.loads(row["files_json"]),
            "created_at": row["created_at"],
        }
