import asyncio
import io
import zipfile
import httpx
from app.main import app, on_startup


async def main() -> None:
    print("0. starting...", flush=True)
    on_startup()
    print("1. db ready", flush=True)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Health
        h = await client.get("/api/health")
        assert h.status_code == 200
        print("2. health ok", flush=True)

        # 2. Demo project
        r = await client.post("/api/projects/demo")
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        print("DEMO:", pid)

        # 3. Analysis summary
        a = (await client.get(f"/api/projects/{pid}/analysis")).json()
        print(
            "SUMMARY:",
            a["total_files"],
            "files,",
            a["total_functions"],
            "fns,",
            a["total_classes"],
            "classes,",
            a["total_methods"],
            "methods,",
            a["total_dependencies"],
            "deps,",
            a["total_calls"],
            "calls",
        )

        # 4. Graph & Impact
        g = (await client.get(f"/api/projects/{pid}/graph")).json()
        print("GRAPH:", len(g["nodes"]), "nodes,", len(g["edges"]), "edges")

        fn = next(n for n in g["nodes"] if n["name"] == "verify_api_token")
        imp = (await client.get(f"/api/projects/{pid}/impact", params={"node_id": fn["id"]})).json()
        print("IMPACT verify_api_token:", imp["total_affected"], imp["risk_level"], [i["name"] for i in imp["direct_impacts"]])

        # 5. Execution flow
        ef = (await client.get(f"/api/projects/{pid}/execution-flow")).json()
        print("EXECUTION FLOWS:", ef["total_flows"])

        # 6. File content
        fc = (await client.get(f"/api/projects/{pid}/files/content", params={"path": "main.py"})).json()
        print("FILE CONTENT main.py lines:", fc["lines"], "symbols:", len(fc["symbols"]))

        # 7. Chat tutor fallback
        ch = (await client.post(f"/api/projects/{pid}/chat", json={"question": "Where does execution begin?"})).json()
        print("CHAT:", ch["mode"], "citations:", len(ch["citations"]))

        # 8. ZIP Upload test
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("sample-app/app.py", "from helper import greet\n\ndef main():\n    return greet('world')\n")
            zf.writestr("sample-app/helper.py", "def greet(name: str) -> str:\n    return f'Hello {name}'\n")
        buf.seek(0)
        up = await client.post("/api/projects/upload", files={"file": ("sample-app.zip", buf.getvalue(), "application/zip")})
        assert up.status_code == 200, up.text
        up_pid = up.json()["id"]
        up_a = (await client.get(f"/api/projects/{up_pid}/analysis")).json()
        print("ZIP UPLOAD:", up_pid, up_a["total_files"], "files,", up_a["total_calls"], "calls")


if __name__ == "__main__":
    asyncio.run(main())
