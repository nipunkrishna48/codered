import io
import os
import re
import shutil
import zipfile
from pathlib import Path
from typing import Tuple

import httpx

from app.config import (
    EXCLUDED_DIRS,
    MAX_EXTRACTED_SIZE_BYTES,
    MAX_FILE_COUNT,
    MAX_UPLOAD_SIZE_BYTES,
)


class ExtractionError(Exception):
    pass


def _is_excluded_rel_path(parts: Tuple[str, ...]) -> bool:
    for part in parts:
        if part in EXCLUDED_DIRS or part.startswith(".") and part not in {".github"}:
            if part in EXCLUDED_DIRS:
                return True
    return False


def _unwrap_single_root_dir(dest_dir: Path) -> None:
    """If a ZIP or GitHub archive extracts into a single wrapper directory, flatten it cleanly."""
    entries = [p for p in dest_dir.iterdir()]
    if len(entries) == 1 and entries[0].is_dir():
        wrapper = entries[0]
        for child in list(wrapper.iterdir()):
            target = dest_dir / child.name
            shutil.move(str(child), str(target))
        wrapper.rmdir()


def safe_extract_zip_bytes(zip_bytes: bytes, dest_dir: Path) -> None:
    if len(zip_bytes) > MAX_UPLOAD_SIZE_BYTES:
        raise ExtractionError(
            f"ZIP archive exceeds maximum upload size of {MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)} MB."
        )

    if dest_dir.exists():
        shutil.rmtree(dest_dir, ignore_errors=True)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_resolved = dest_dir.resolve()

    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile as exc:
        raise ExtractionError("Invalid or corrupted ZIP archive.") from exc

    total_size = 0
    file_count = 0

    with zf:
        for info in zf.infolist():
            if info.is_dir():
                continue

            raw_name = info.filename.replace("\\", "/")
            # Reject absolute paths or path traversal
            if raw_name.startswith("/") or ".." in Path(raw_name).parts:
                raise ExtractionError(f"Unsafe path detected in archive: {raw_name}")

            rel_path = Path(raw_name)
            if _is_excluded_rel_path(rel_path.parts):
                continue

            file_count += 1
            if file_count > MAX_FILE_COUNT:
                raise ExtractionError(f"Repository exceeds maximum supported file count ({MAX_FILE_COUNT}).")

            total_size += info.file_size
            if total_size > MAX_EXTRACTED_SIZE_BYTES:
                raise ExtractionError(
                    f"Extracted repository exceeds maximum size ({MAX_EXTRACTED_SIZE_BYTES // (1024 * 1024)} MB)."
                )

            target_path = (dest_resolved / rel_path).resolve()
            if not str(target_path).startswith(str(dest_resolved)):
                raise ExtractionError(f"Path traversal blocked: {raw_name}")

            target_path.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info, "r") as src, open(target_path, "wb") as dst:
                shutil.copyfileobj(src, dst)

    if file_count == 0:
        raise ExtractionError("The uploaded ZIP archive contains no readable repository files.")

    _unwrap_single_root_dir(dest_dir)


def parse_github_repo_slug(url_or_slug: str) -> Tuple[str, str]:
    cleaned = url_or_slug.strip().rstrip("/")
    cleaned = re.sub(r"\.git$", "", cleaned)

    match = re.match(r"^(?:https?://github\.com/)?([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)(?:/.*)?$", cleaned)
    if not match:
        raise ExtractionError(
            "Invalid GitHub repository URL. Expected format: https://github.com/owner/repo or owner/repo"
        )
    return match.group(1), match.group(2)


async def download_github_repo(url_or_slug: str, dest_dir: Path, branch: str | None = None) -> str:
    owner, repo = parse_github_repo_slug(url_or_slug)
    repo_name = f"{owner}/{repo}"

    candidate_urls = []
    if branch:
        candidate_urls.append(f"https://github.com/{owner}/{repo}/archive/refs/heads/{branch}.zip")
    else:
        candidate_urls.append(f"https://api.github.com/repos/{owner}/{repo}/zipball")
        candidate_urls.append(f"https://github.com/{owner}/{repo}/archive/refs/heads/main.zip")
        candidate_urls.append(f"https://github.com/{owner}/{repo}/archive/refs/heads/master.zip")

    headers = {
        "User-Agent": "Codebase-Intelligence-Platform/1.0",
        "Accept": "application/vnd.github+json",
    }

    last_error = "Could not download repository from GitHub."
    async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
        for url in candidate_urls:
            try:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200 and len(resp.content) > 100:
                    safe_extract_zip_bytes(resp.content, dest_dir)
                    return repo_name
                if resp.status_code == 404:
                    last_error = f"Repository '{repo_name}' or branch not found (404). Make sure it is public."
                elif resp.status_code == 403:
                    last_error = "GitHub rate limit or access denied (403). Try uploading a ZIP archive instead."
                else:
                    last_error = f"GitHub returned HTTP {resp.status_code} for {repo_name}."
            except ExtractionError:
                raise
            except httpx.RequestError as exc:
                last_error = (
                    f"Network error contacting GitHub ({exc.__class__.__name__}). "
                    "If running offline or behind a firewall, please upload the repository as a ZIP file."
                )

    raise ExtractionError(last_error)
