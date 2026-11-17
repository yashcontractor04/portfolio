"""Loads and validates news/config/sources.yaml.

The YAML file is the only place where sources are listed. pydantic turns it into
typed objects and rejects typos (unknown keys, bad slugs, non-https URLs) before
anything is fetched.
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import yaml
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, StringConstraints, model_validator

CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"

Slug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9-]{2,40}$")]
Lang = Annotated[str, StringConstraints(pattern=r"^[a-z]{2}$")]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")  # a misspelled key is an error, not silently ignored


class Feed(Strict):
    name: str = Field(min_length=1, max_length=120)
    url: HttpUrl
    lang: Lang = "en"

    @model_validator(mode="after")
    def https_only(self) -> Feed:
        if self.url.scheme != "https":
            raise ValueError(f"feed {self.name!r} must use https")
        return self


class GoogleNewsSearch(Strict):
    query: str = Field(min_length=2, max_length=120)
    hl: str = "en-US"  # interface language
    gl: str = "US"  # country
    ceid: str = "US:en"  # country:language edition

    @property
    def lang(self) -> str:
        return self.hl[:2].lower()


class HackerNews(Strict):
    min_score: int = Field(default=150, ge=1)
    max_items: int = Field(default=30, ge=1, le=60)


class Topic(Strict):
    slug: Slug
    label: str = Field(min_length=1, max_length=80)
    feeds: list[Feed] = []
    google_news: list[GoogleNewsSearch] = []
    hacker_news: HackerNews | None = None


class Settings(Strict):
    max_age_hours: int = Field(default=24, ge=1, le=72)
    max_items_per_source: int = Field(default=25, ge=1, le=100)
    timeout_seconds: float = Field(default=10, gt=0, le=30)
    user_agent: str = Field(min_length=5, max_length=200)
    google_news_pause_seconds: float = Field(default=1.0, ge=0, le=10)
    google_news_retry_seconds: float = Field(default=8.0, ge=0, le=60)


class SourcesConfig(Strict):
    settings: Settings
    topics: list[Topic] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def unique_slugs(self) -> SourcesConfig:
        slugs = [t.slug for t in self.topics]
        if len(slugs) != len(set(slugs)):
            raise ValueError("topic slugs must be unique")
        return self


def load_sources(path: Path | None = None) -> SourcesConfig:
    raw = yaml.safe_load((path or CONFIG_DIR / "sources.yaml").read_text(encoding="utf-8"))
    return SourcesConfig.model_validate(raw)
