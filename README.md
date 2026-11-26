# CodeAtlas Intel — Codebase Intelligence & Visualisation Platform

**Team Eternals | Unisys Problem Statement 02 | CodeRed'26**

> "See the whole codebase. Understand how everything connects."

## Architecture

- **Backend (`backend/`)**: FastAPI, NetworkX, Python AST, Tree-sitter (JS/TS/Java), Regex fallback parser, SQLite persistence, WebSockets.
- **Frontend (`frontend/`)**: React 18, TypeScript, Vite, Tailwind CSS, React Flow (`@xyflow/react`), Dagre layout, Monaco Editor, Recharts, Framer Motion, Lucide Icons.

## Running Locally

### 1. Start the Backend (Port 8000)
```powershell
cd backend
.\.venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 2. Start the Frontend (Port 5173)
```powershell
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser.

## Live Frontend

The frontend is published at [https://nipunkrishna48.github.io/codered/](https://nipunkrishna48.github.io/codered/).
Analysis features require the FastAPI backend to be hosted separately.
