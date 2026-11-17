"""The LLM behind a small interface, so the model or the vendor can be swapped.

`LLMProvider` is all the rest of the pipeline knows: text in, parsed JSON out.
`GeminiProvider` is one implementation (plain HTTPS, no SDK). Tests use a fake.
`Budget` decides whether a request may be sent at all.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Protocol

import httpx
import yaml
from pydantic import BaseModel, ConfigDict, Field

from .config import CONFIG_DIR

log = logging.getLogger("news.llm")


class LlmConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: str = "gemini"
    model: str
    fallback_model: str | None = None
    daily_cap: int = Field(ge=0, le=5000)
    per_run_cap: int = Field(ge=0, le=100)
    max_n: int = Field(ge=1, le=20)
    candidates_per_user: int = Field(ge=5, le=200)
    summaries_per_request: int = Field(ge=1, le=10)
    summary_requests_per_run: int = Field(default=2, ge=1, le=5)
    read_full_articles: bool = True
    article_text_chars: int = Field(default=6000, ge=500, le=20000)
    window_hours: int = Field(ge=1, le=72)
    wide_window_hours: int = Field(ge=1, le=72)
    retry_wait_seconds: float = Field(ge=0, le=120)


def load_llm_config(path: Path | None = None) -> LlmConfig:
    return LlmConfig.model_validate(
        yaml.safe_load((path or CONFIG_DIR / "llm.yaml").read_text(encoding="utf-8"))
    )


class RateLimited(Exception):
    """The provider is rate-limiting us (HTTP 429) or is overloaded (HTTP 5xx). Worth a retry."""


class ProviderError(Exception):
    """The provider refused the request (another HTTP status). Retrying will not help."""

    def __init__(self, status: int) -> None:
        super().__init__(f"HTTP {status}")
        self.status = status


class LimitReached(Exception):
    """Our own budget (per run or per day) or the provider's limit stops this run."""


class LLMProvider(Protocol):
    def generate_json(self, model: str, prompt: str) -> object: ...


class GeminiProvider:
    URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    def __init__(self, api_key: str, client: httpx.Client | None = None) -> None:
        self.api_key = api_key
        self.client = client or httpx.Client(timeout=60)

    def generate_json(self, model: str, prompt: str) -> object:
        response = self.client.post(
            self.URL.format(model=model),
            headers={"x-goog-api-key": self.api_key},  # header, so the key never appears in a URL or log
            json={
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
            },
        )
        if response.status_code == 429 or response.status_code >= 500:
            raise RateLimited()
        if response.status_code != 200:
            raise ProviderError(response.status_code)
        return json.loads(self._text(response.json()))

    @staticmethod
    def _text(body: dict) -> str:
        """The answer text. An answer can come in several parts, and a model that
        "thinks" marks those parts with `thought`; only the real answer is kept."""
        candidates = body.get("candidates") or [{}]
        parts = (candidates[0].get("content") or {}).get("parts") or []
        text = "".join(part.get("text", "") for part in parts if not part.get("thought"))
        if not text:
            # e.g. finishReason MAX_TOKENS or SAFETY. The reason is safe to log.
            log.warning("empty answer, finish reason: %s", candidates[0].get("finishReason"))
            raise ValueError("empty answer")
        return text


class Budget:
    """Asks the database before every request (news.reserve_llm_request) and handles 429:
    wait once, retry, then the fallback model, then give up with LimitReached."""

    def __init__(self, provider: LLMProvider, config: LlmConfig, reserve, sleep=time.sleep) -> None:
        self.provider, self.config, self.reserve, self.sleep = provider, config, reserve, sleep
        self.requests = 0

    def _send(self, model: str, prompt: str) -> object:
        if self.requests >= self.config.per_run_cap or not self.reserve(model, self.config.daily_cap):
            raise LimitReached()
        self.requests += 1
        return self.provider.generate_json(model, prompt)

    def call(self, prompt: str) -> object:
        models = [self.config.model] + ([self.config.fallback_model] if self.config.fallback_model else [])
        for index, model in enumerate(models):
            try:
                try:
                    return self._send(model, prompt)
                except RateLimited:
                    if index == 0:
                        self.sleep(self.config.retry_wait_seconds)
                        return self._send(model, prompt)
                    raise
            except (RateLimited, LimitReached):
                log.warning("model %s is limited", model)
        raise LimitReached()
