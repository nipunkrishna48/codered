from pathlib import Path
import shutil


DEMO_FILES = {
    "README.md": """# FinPulse Payment & Ledger Service (Demo Codebase)

A modular payment processing, fraud screening, and double-entry ledger backend used as the live demonstration repository for the Codebase Intelligence Platform.

## Architecture
- `main.py`: Application bootstrap & HTTP route definitions
- `app/core/config.py`: Runtime configuration loader
- `app/core/auth.py`: API token verification & merchant authentication
- `app/db/ledger_store.py`: Persistent ledger & transaction storage layer
- `app/services/fraud_engine.py`: Risk scoring & velocity rules
- `app/services/notification.py`: Webhook & audit alert dispatcher
- `app/services/payment_processor.py`: Core payment orchestration pipeline
""",
    "requirements.txt": """fastapi==0.115.0
pydantic==2.9.0
uvicorn==0.32.0
""",
    "app/__init__.py": """# FinPulse Application Package
""",
    "app/core/__init__.py": """# Core utilities
""",
    "app/core/config.py": """from dataclasses import dataclass
import os


@dataclass
class AppConfig:
    service_name: str
    max_transaction_amount: float
    fraud_threshold: int
    webhook_enabled: bool


def load_config() -> AppConfig:
    \"\"\"Load FinPulse runtime settings from environment with safe defaults.\"\"\"
    return AppConfig(
        service_name=os.getenv("SERVICE_NAME", "finpulse-ledger"),
        max_transaction_amount=float(os.getenv("MAX_TX_AMOUNT", "50000.0")),
        fraud_threshold=int(os.getenv("FRAUD_THRESHOLD", "75")),
        webhook_enabled=True,
    )
""",
    "app/core/auth.py": """from typing import Dict


class AuthError(Exception):
    \"\"\"Raised when merchant credentials fail verification.\"\"\"


def verify_api_token(token: str) -> Dict[str, str]:
    \"\"\"Validate bearer token and return merchant identity context.\"\"\"
    if not token or not token.startswith("fp_live_"):
        raise AuthError("Invalid or missing FinPulse API token")
    merchant_id = token.replace("fp_live_", "")[:12]
    return {"merchant_id": merchant_id, "tier": "enterprise"}


def check_merchant_permissions(merchant: Dict[str, str], action: str) -> bool:
    \"\"\"Verify merchant tier permits the requested ledger operation.\"\"\"
    if action == "refund" and merchant.get("tier") == "sandbox":
        return False
    return True
""",
    "app/db/__init__.py": """# Persistence layer
""",
    "app/db/ledger_store.py": """from typing import Any, Dict, List


class LedgerRepository:
    \"\"\"Handles transaction records and double-entry balance updates.\"\"\"

    def __init__(self, dsn: str = "sqlite:///ledger.db") -> None:
        self.dsn = dsn
        self._records: List[Dict[str, Any]] = []

    def save_transaction(self, tx_id: str, merchant_id: str, amount: float, status: str) -> Dict[str, Any]:
        \"\"\"Persist an immutable payment transaction entry.\"\"\"
        record = {
            "tx_id": tx_id,
            "merchant_id": merchant_id,
            "amount": amount,
            "status": status,
        }
        self._records.append(record)
        self.append_audit_log(tx_id, f"Transaction recorded with status={status}")
        return record

    def append_audit_log(self, tx_id: str, message: str) -> None:
        \"\"\"Write a structured audit trail entry for compliance.\"\"\"
        _ = f"[AUDIT:{tx_id}] {message}"

    def get_merchant_history(self, merchant_id: str) -> List[Dict[str, Any]]:
        \"\"\"Fetch recent transactions for velocity & fraud checks.\"\"\"
        return [r for r in self._records if r["merchant_id"] == merchant_id]
""",
    "app/services/__init__.py": """# Domain services
""",
    "app/services/fraud_engine.py": """from app.core.config import load_config
from app.db.ledger_store import LedgerRepository


class FraudEngine:
    \"\"\"Evaluates transaction risk scores using amount and velocity heuristics.\"\"\"

    def __init__(self, repo: LedgerRepository) -> None:
        self.repo = repo
        self.config = load_config()

    def calculate_risk_score(self, merchant_id: str, amount: float) -> int:
        \"\"\"Compute 0-100 risk score for an incoming payment request.\"\"\"
        score = 10
        if amount > self.config.max_transaction_amount * 0.5:
            score += 45
        history = self.repo.get_merchant_history(merchant_id)
        if len(history) > 10:
            score += 20
        return min(100, score)

    def is_transaction_allowed(self, merchant_id: str, amount: float) -> bool:
        \"\"\"Determine whether payment passes configured fraud threshold.\"\"\"
        score = self.calculate_risk_score(merchant_id, amount)
        return score < self.config.fraud_threshold
""",
    "app/services/notification.py": """from app.core.config import load_config


def dispatch_webhook(event_type: str, tx_id: str, payload: dict) -> bool:
    \"\"\"Send asynchronous payment status webhook to merchant endpoint.\"\"\"
    cfg = load_config()
    if not cfg.webhook_enabled:
        return False
    _ = format_event_payload(event_type, tx_id, payload)
    return True


def format_event_payload(event_type: str, tx_id: str, payload: dict) -> dict:
    \"\"\"Normalize webhook envelope schema.\"\"\"
    return {"event": event_type, "transaction_id": tx_id, "data": payload}


def notify_compliance_team(tx_id: str, reason: str) -> None:
    \"\"\"Escalate high-risk blocked payments for manual review.\"\"\"
    dispatch_webhook("compliance.alert", tx_id, {"reason": reason})
""",
    "app/services/payment_processor.py": """from app.core.auth import check_merchant_permissions, verify_api_token
from app.db.ledger_store import LedgerRepository
from app.services.fraud_engine import FraudEngine
from app.services.notification import dispatch_webhook, notify_compliance_team


class PaymentProcessor:
    \"\"\"Coordinates authentication, fraud screening, ledger persistence, and webhooks.\"\"\"

    def __init__(self) -> None:
        self.repo = LedgerRepository()
        self.fraud = FraudEngine(self.repo)

    def process_payment(self, token: str, tx_id: str, amount: float) -> dict:
        \"\"\"Execute end-to-end payment authorization and ledger commit.\"\"\"
        merchant = verify_api_token(token)
        if not check_merchant_permissions(merchant, "charge"):
            return {"status": "forbidden", "tx_id": tx_id}

        merchant_id = merchant["merchant_id"]
        if not self.fraud.is_transaction_allowed(merchant_id, amount):
            self.repo.save_transaction(tx_id, merchant_id, amount, "blocked")
            notify_compliance_team(tx_id, "Exceeded fraud risk threshold")
            return {"status": "blocked", "tx_id": tx_id}

        record = self.repo.save_transaction(tx_id, merchant_id, amount, "settled")
        dispatch_webhook("payment.settled", tx_id, record)
        return {"status": "settled", "record": record}

    def refund_payment(self, token: str, tx_id: str, amount: float) -> dict:
        \"\"\"Issue a full or partial refund for a settled payment.\"\"\"
        merchant = verify_api_token(token)
        if not check_merchant_permissions(merchant, "refund"):
            return {"status": "forbidden", "tx_id": tx_id}
        record = self.repo.save_transaction(tx_id, merchant["merchant_id"], -amount, "refunded")
        dispatch_webhook("payment.refunded", tx_id, record)
        return {"status": "refunded", "record": record}
""",
    "main.py": """from fastapi import FastAPI

from app.core.config import load_config
from app.services.payment_processor import PaymentProcessor

app = FastAPI(title="FinPulse Payment Service")
processor = PaymentProcessor()


def initialize_service() -> dict:
    \"\"\"Bootstrap configuration and verify processor readiness.\"\"\"
    cfg = load_config()
    return {"service": cfg.service_name, "threshold": cfg.fraud_threshold}


@app.post("/payments/charge")
def create_charge_endpoint(token: str, tx_id: str, amount: float) -> dict:
    \"\"\"HTTP endpoint to authorize and settle a merchant payment.\"\"\"
    return processor.process_payment(token, tx_id, amount)


@app.post("/payments/refund")
def create_refund_endpoint(token: str, tx_id: str, amount: float) -> dict:
    \"\"\"HTTP endpoint to refund a previous merchant payment.\"\"\"
    return processor.refund_payment(token, tx_id, amount)


def main() -> None:
    \"\"\"CLI entrypoint to initialize service and run a sample charge.\"\"\"
    initialize_service()
    processor.process_payment("fp_live_demo_merchant", "tx_1001", 250.0)


if __name__ == "__main__":
    main()
""",
}


def materialize_demo_repo(dest_dir: Path) -> Path:
    if dest_dir.exists():
        shutil.rmtree(dest_dir, ignore_errors=True)
    dest_dir.mkdir(parents=True, exist_ok=True)
    for rel_path, content in DEMO_FILES.items():
        target = dest_dir / rel_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    return dest_dir
