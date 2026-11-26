import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
REPOS_DIR = DATA_DIR / "repos"
DB_PATH = DATA_DIR / "codebase_intel.db"

DATA_DIR.mkdir(parents=True, exist_ok=True)
REPOS_DIR.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB ZIP limit
MAX_EXTRACTED_SIZE_BYTES = 120 * 1024 * 1024  # 120 MB extracted limit
MAX_FILE_COUNT = 2500
MAX_FILE_READ_BYTES = 512 * 1024  # 512 KB per source file for parsing/viewing

EXCLUDED_DIRS = {
    ".git",
    ".svn",
    ".hg",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "venv",
    ".venv",
    "env",
    ".env",
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    "target",
    "bin",
    "obj",
    "coverage",
    ".idea",
    ".vscode",
    "vendor",
    "site-packages",
}

EXCLUDED_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg", ".webp",
    ".mp3", ".mp4", ".wav", ".avi", ".mov", ".webm",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".pdf", ".zip", ".tar", ".gz", ".rar", ".7z",
    ".exe", ".dll", ".so", ".dylib", ".pyc", ".pyo", ".class", ".jar",
    ".lock", ".min.js", ".min.css", ".map", ".db", ".sqlite", ".sqlite3",
}

LANGUAGE_EXTENSIONS = {
    ".py": "Python",
    ".js": "JavaScript",
    ".jsx": "JavaScript (React)",
    ".mjs": "JavaScript",
    ".cjs": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript (React)",
    ".java": "Java",
    ".go": "Go",
    ".rs": "Rust",
    ".cpp": "C++",
    ".cc": "C++",
    ".cxx": "C++",
    ".c": "C",
    ".h": "C/C++ Header",
    ".hpp": "C++ Header",
    ".cs": "C#",
    ".rb": "Ruby",
    ".php": "PHP",
    ".swift": "Swift",
    ".kt": "Kotlin",
    ".scala": "Scala",
    ".sql": "SQL",
    ".html": "HTML",
    ".css": "CSS",
    ".scss": "SCSS",
    ".json": "JSON",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".toml": "TOML",
    ".md": "Markdown",
    ".sh": "Shell",
    ".ps1": "PowerShell",
}

# Optional LLM Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
LLM_API_KEY = os.getenv("LLM_API_KEY", "").strip() or OPENAI_API_KEY
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini").strip()
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").strip()
