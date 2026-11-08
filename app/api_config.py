"""多服务商 API 配置。

配置文件 db/api_config.json（v2）：
- providers：内置通义千问、月之暗面、智谱、深度求索，以及用户自定义服务；
- active：首页当前使用的服务与模型；
- 每个模型可以单独启用/停用，Key 只在服务端保存并掩码返回。

旧版单服务配置会在读取时自动映射到深度求索或当前默认服务。
"""

import hashlib
import json
import os
import re
import threading
import urllib.error
import urllib.request

from . import config

CONFIG_PATH = config.APP_DIR / "db" / "api_config.json"

DEFAULT_CONFIG = {
    "api_base": "https://api.deepseek.com/v1",
    "api_key": "",
    "model": "deepseek-chat",
    "timeout": 180,
    "temperature": 0.7,
}

BUILTIN_PROVIDERS = [
    {
        "id": "qwen",
        "name": "通义千问",
        "api_base": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "models": ["qwen-plus", "qwen-turbo", "qwen-max", "qwen-long"],
    },
    {
        "id": "moonshot",
        "name": "月之暗面",
        "api_base": "https://api.moonshot.cn/v1",
        "models": ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
    },
    {
        "id": "zhipu",
        "name": "智谱",
        "api_base": "https://open.bigmodel.cn/api/paas/v4",
        "models": ["glm-4-plus", "glm-4-flash", "glm-4-air", "glm-4v-plus"],
    },
    {
        "id": "deepseek",
        "name": "深度求索",
        "api_base": "https://api.deepseek.com/v1",
        "models": ["deepseek-chat", "deepseek-reasoner"],
    },
]
_BUILTIN_BY_ID = {item["id"]: item for item in BUILTIN_PROVIDERS}
_lock = threading.Lock()


class APIError(Exception):
    """服务商配置或模型扫描失败。"""


def _now() -> str:
    from datetime import datetime

    return datetime.now().isoformat(timespec="seconds")


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9_-]+", "-", (value or "").lower()).strip("-")
    return slug[:32] or "custom"


def _models(values, existing=None) -> list[dict]:
    previous = {m["id"]: bool(m.get("enabled", True)) for m in existing or []}
    result: list[dict] = []
    seen: set[str] = set()
    for value in values or []:
        if isinstance(value, dict):
            model_id = str(value.get("id") or "").strip()
            enabled = value.get("enabled", previous.get(model_id, True))
        else:
            model_id = str(value or "").strip()
            enabled = previous.get(model_id, True)
        if not model_id or model_id in seen:
            continue
        seen.add(model_id)
        result.append({"id": model_id, "enabled": bool(enabled)})
    for model_id, enabled in previous.items():
        if model_id not in seen:
            result.append({"id": model_id, "enabled": enabled})
    return result


def _default_provider(spec: dict) -> dict:
    return {
        "id": spec["id"],
        "name": spec["name"],
        "kind": "builtin",
        "api_base": spec["api_base"],
        "api_key": "",
        "models": _models(spec.get("models")),
        "timeout": DEFAULT_CONFIG["timeout"],
        "temperature": DEFAULT_CONFIG["temperature"],
        "updated_at": "",
    }


def _default_config() -> dict:
    providers = [_default_provider(item) for item in BUILTIN_PROVIDERS]
    return {
        "version": 2,
        "active": {"provider_id": "deepseek", "model": "deepseek-chat"},
        "providers": providers,
    }


def _provider_map(providers: list[dict]) -> dict[str, dict]:
    return {item.get("id"): item for item in providers if item.get("id")}


def _normalize(raw: dict) -> dict:
    if not isinstance(raw, dict):
        raw = {}
    if raw.get("version") == 2 and isinstance(raw.get("providers"), list):
        providers = []
        for item in raw["providers"]:
            if not isinstance(item, dict) or not item.get("id"):
                continue
            builtin = _BUILTIN_BY_ID.get(item["id"])
            provider = {
                "id": _slug(item["id"]),
                "name": (item.get("name") or (builtin or {}).get("name") or item["id"]).strip(),
                "kind": "builtin" if builtin and item.get("kind") != "custom" else "custom",
                "api_base": (item.get("api_base") or (builtin or {}).get("api_base") or "").strip(),
                "api_key": (item.get("api_key") or "").strip(),
                "models": _models(item.get("models"), []),
                "timeout": float(item.get("timeout") or DEFAULT_CONFIG["timeout"]),
                "temperature": float(
                    item.get("temperature")
                    if item.get("temperature") is not None
                    else DEFAULT_CONFIG["temperature"]
                ),
                "updated_at": item.get("updated_at") or "",
            }
            providers.append(provider)
        present = {p["id"] for p in providers}
        for spec in BUILTIN_PROVIDERS:
            if spec["id"] not in present:
                providers.append(_default_provider(spec))
        if not providers:
            providers = _default_config()["providers"]
        active = raw.get("active") or {}
        provider = _provider_map(providers).get(active.get("provider_id")) or providers[0]
        enabled = [m["id"] for m in provider.get("models") or [] if m.get("enabled")]
        model = active.get("model") or (enabled[0] if enabled else "")
        return {
            "version": 2,
            "active": {"provider_id": provider["id"], "model": model},
            "providers": providers,
        }

    # 旧版扁平配置：映射到深度求索，保留原有 Key 与模型
    cfg = _default_config()
    deepseek = _provider_map(cfg["providers"])["deepseek"]
    if raw.get("api_base"):
        deepseek["api_base"] = str(raw["api_base"]).strip()
    if raw.get("api_key"):
        deepseek["api_key"] = str(raw["api_key"]).strip()
    if raw.get("timeout") is not None:
        deepseek["timeout"] = float(raw["timeout"])
    if raw.get("temperature") is not None:
        deepseek["temperature"] = float(raw["temperature"])
    legacy_model = str(raw.get("model") or "").strip()
    if legacy_model:
        deepseek["models"] = _models(
            [legacy_model, *deepseek["models"]], deepseek["models"]
        )
        cfg["active"]["model"] = legacy_model
    return cfg


def load() -> dict:
    """读取并规范化配置；文件不存在或损坏时返回内置服务默认值。"""
    if not CONFIG_PATH.exists():
        return _default_config()
    try:
        with _lock:
            raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return _default_config()
    return _normalize(raw if isinstance(raw, dict) else {})


def _write(cfg: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = CONFIG_PATH.with_suffix(".json.tmp")
    with _lock:
        tmp.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(CONFIG_PATH)


def _env(key: str, default: str = "") -> str:
    value = os.environ.get("LLM_" + key.upper())
    return value if value not in (None, "") else default


def _same_endpoint(left: str, right: str) -> bool:
    return left.rstrip("/") == right.rstrip("/")


def _env_key_for_endpoint(api_base: str) -> str:
    env_base = _env("api_base") or DEFAULT_CONFIG["api_base"]
    return _env("api_key") if _same_endpoint(api_base, env_base) else ""


def active_provider(cfg: dict | None = None) -> dict:
    cfg = cfg or load()
    providers = _provider_map(cfg["providers"])
    provider = providers.get((cfg.get("active") or {}).get("provider_id"))
    return provider or cfg["providers"][0]


def active_model(cfg: dict | None = None) -> str:
    cfg = cfg or load()
    provider = active_provider(cfg)
    enabled = [m["id"] for m in provider.get("models") or [] if m.get("enabled")]
    model = (cfg.get("active") or {}).get("model") or ""
    return model if model in enabled else (enabled[0] if enabled else "")


def effective() -> dict:
    """返回当前生效配置，保持旧调用方需要的扁平字段。"""
    cfg = load()
    provider = active_provider(cfg)
    model = active_model(cfg)
    base = provider.get("api_base") or DEFAULT_CONFIG["api_base"]
    if not provider.get("api_key") and provider["id"] == "deepseek" and _env("api_base"):
        base = _env("api_base")
    key = provider.get("api_key") or _env_key_for_endpoint(base)
    if not model:
        model = _env("model", DEFAULT_CONFIG["model"])
    return {
        "provider_id": provider["id"],
        "provider_name": provider["name"],
        "api_base": base,
        "api_key": key,
        "model": model,
        "timeout": float(provider.get("timeout") or _env("timeout", "180")),
        "temperature": float(
            provider.get("temperature")
            if provider.get("temperature") is not None
            else _env("temperature", "0.7")
        ),
    }


def llm_kwargs() -> dict:
    """返回 llm.chat() 所需的参数。"""
    current = effective()
    return {
        "api_base": current["api_base"],
        "api_key": current["api_key"],
        "model": current["model"],
        "timeout": current["timeout"],
        "temperature": current["temperature"],
    }


def mask_key(key: str) -> str:
    key = (key or "").strip()
    if not key:
        return ""
    if len(key) <= 8:
        return "****"
    return f"{key[:4]}…{key[-4:]}"


def is_configured() -> bool:
    current = effective()
    return bool(current["api_key"] and current["model"] and current["api_base"])


def _public_provider(provider: dict) -> dict:
    key = provider.get("api_key") or ""
    return {
        "id": provider["id"],
        "name": provider["name"],
        "kind": provider.get("kind") or "custom",
        "api_base": provider.get("api_base") or "",
        "has_key": bool(key),
        "api_key_masked": mask_key(key),
        "models": [
            {"id": m["id"], "enabled": bool(m.get("enabled", True))}
            for m in provider.get("models") or []
        ],
        "timeout": provider.get("timeout", DEFAULT_CONFIG["timeout"]),
        "temperature": provider.get(
            "temperature", DEFAULT_CONFIG["temperature"]
        ),
        "updated_at": provider.get("updated_at") or "",
    }


def public_state() -> dict:
    """返回多服务商配置（不含完整 Key）与可切换模型。"""
    cfg = load()
    providers = [_public_provider(p) for p in cfg["providers"]]
    active = {
        "provider_id": cfg["active"]["provider_id"],
        "model": active_model(cfg),
    }
    enabled = [
        {
            "provider_id": p["id"],
            "provider_name": p["name"],
            "model": m["id"],
            "active": p["id"] == active["provider_id"] and m["id"] == active["model"],
        }
        for p in providers
        for m in p["models"]
        if m["enabled"]
    ]
    return {"providers": providers, "active": active, "enabled_models": enabled}


def public() -> dict:
    """旧版扁平视图，供旧接口和兼容调用。"""
    current = effective()
    return {
        "api_base": current["api_base"],
        "model": current["model"],
        "timeout": current["timeout"],
        "temperature": current["temperature"],
        "has_key": bool(current["api_key"]),
        "api_key_masked": mask_key(current["api_key"]),
        "provider_id": current["provider_id"],
        "provider_name": current["provider_name"],
    }


def _parse_timeout(value, default: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return float(default)
    return number if number > 0 else float(default)


def _parse_temperature(value, default: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return float(default)
    return max(0.0, min(2.0, number))


def upsert_provider(payload: dict) -> dict:
    """新增或更新服务商；Key 留空表示保留旧值。"""
    cfg = load()
    providers = cfg["providers"]
    raw_id = str(payload.get("id") or "").strip()
    raw_name = str(payload.get("name") or "").strip()
    if raw_id:
        provider_id = _slug(raw_id)
    else:
        provider_id = _slug(raw_name or "custom")
        if provider_id == "custom" and raw_name:
            provider_id = "custom-" + hashlib.sha1(raw_name.encode("utf-8")).hexdigest()[:6]
    existing = _provider_map(providers).get(provider_id)
    builtin = _BUILTIN_BY_ID.get(provider_id)
    name = (
        raw_name
        or (existing or {}).get("name")
        or (builtin or {}).get("name")
        or provider_id
    ).strip()
    api_base = (payload.get("api_base") or (existing or {}).get("api_base") or (builtin or {}).get("api_base") or "").strip()
    if not api_base:
        raise APIError("API 地址不能为空")
    if not api_base.startswith(("http://", "https://")):
        raise APIError("API 地址必须以 http:// 或 https:// 开头")

    if existing is None and builtin is None and not str(payload.get("name") or "").strip():
        raise APIError("自定义服务需要填写名称")

    key = (existing or {}).get("api_key") or ""
    new_key = str(payload.get("api_key") or "").strip()
    if (
        existing
        and key
        and not new_key
        and not payload.get("clear_key")
        and not _same_endpoint(api_base, existing["api_base"])
    ):
        raise APIError("API 地址已变更，请重新填写该服务的 API Key")
    if payload.get("clear_key"):
        key = ""
    elif new_key:
        key = new_key

    if "models" in payload:
        models = _models(payload.get("models"), (existing or {}).get("models"))
    elif existing:
        models = existing["models"]
    else:
        models = _models((builtin or {}).get("models") or [])

    provider = {
        "id": provider_id,
        "name": name,
        "kind": "builtin" if builtin else "custom",
        "api_base": api_base,
        "api_key": key,
        "models": models,
        "timeout": _parse_timeout(
            payload.get("timeout"), (existing or {}).get("timeout", DEFAULT_CONFIG["timeout"])
        ),
        "temperature": _parse_temperature(
            payload.get("temperature"),
            (existing or {}).get("temperature", DEFAULT_CONFIG["temperature"]),
        ),
        "updated_at": _now(),
    }
    if existing:
        providers[providers.index(existing)] = provider
    else:
        providers.append(provider)

    active = cfg["active"]
    if active.get("provider_id") == provider_id:
        enabled = [m["id"] for m in models if m["enabled"]]
        if active.get("model") not in enabled:
            active["model"] = enabled[0] if enabled else ""
    _write(cfg)
    return _public_provider(provider)


def delete_provider(provider_id: str) -> bool:
    cfg = load()
    providers = [p for p in cfg["providers"] if p["id"] != provider_id]
    if len(providers) == len(cfg["providers"]):
        return False
    if not providers:
        raise APIError("至少保留一个服务")
    cfg["providers"] = providers
    if cfg["active"]["provider_id"] == provider_id:
        cfg["active"] = {
            "provider_id": providers[0]["id"] if providers else "",
            "model": "",
        }
        if providers:
            enabled = [m["id"] for m in providers[0]["models"] if m["enabled"]]
            cfg["active"]["model"] = enabled[0] if enabled else ""
    _write(cfg)
    return True


def set_active(provider_id: str, model: str) -> dict:
    cfg = load()
    provider = _provider_map(cfg["providers"]).get(provider_id)
    if provider is None:
        raise APIError("服务不存在")
    enabled = [m["id"] for m in provider["models"] if m["enabled"]]
    if model not in enabled:
        raise APIError("该模型未启用或不存在")
    cfg["active"] = {"provider_id": provider_id, "model": model}
    _write(cfg)
    return public_state()["active"]


def set_model_enabled(provider_id: str, model_id: str, enabled: bool) -> dict:
    cfg = load()
    provider = _provider_map(cfg["providers"]).get(provider_id)
    if provider is None:
        raise APIError("服务不存在")
    target = next((m for m in provider["models"] if m["id"] == model_id), None)
    if target is None:
        raise APIError("模型不存在")
    if not enabled and cfg["active"] == {"provider_id": provider_id, "model": model_id}:
        others = [
            m["id"]
            for m in provider["models"]
            if m["enabled"] and m["id"] != model_id
        ]
        if not others:
            raise APIError("至少保留一个启用模型")
        cfg["active"] = {"provider_id": provider_id, "model": others[0]}
    target["enabled"] = bool(enabled)
    _write(cfg)
    return _public_provider(provider)


def _http_models(provider: dict) -> list[str]:
    key = provider.get("api_key") or _env_key_for_endpoint(provider["api_base"])
    if not key:
        raise APIError("请先填写这个服务的 API Key")
    url = provider["api_base"].rstrip("/") + "/models"
    request = urllib.request.Request(
        url, headers={"Authorization": f"Bearer {key}"}
    )
    try:
        with urllib.request.urlopen(
            request, timeout=min(30, float(provider.get("timeout") or 20))
        ) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")[:300]
        raise APIError(f"模型列表返回 HTTP {exc.code}：{detail}") from exc
    except urllib.error.URLError as exc:
        raise APIError(f"无法连接模型列表：{exc.reason}") from exc
    except TimeoutError as exc:
        raise APIError("模型列表请求超时") from exc
    except (ValueError, TypeError) as exc:
        raise APIError("模型列表返回格式异常") from exc

    raw = body.get("data") if isinstance(body, dict) else body
    if not isinstance(raw, list):
        raise APIError("模型列表返回格式异常")
    models = []
    for item in raw:
        model_id = item.get("id") if isinstance(item, dict) else str(item)
        if model_id:
            models.append(str(model_id))
    return sorted(set(models))


def scan_models(provider_id: str) -> dict:
    cfg = load()
    provider = _provider_map(cfg["providers"]).get(provider_id)
    if provider is None:
        raise APIError("服务不存在")
    found = _http_models(provider)
    if not found:
        raise APIError("服务没有返回可用模型")
    provider["models"] = _models(found, provider["models"])
    provider["updated_at"] = _now()
    enabled = [m["id"] for m in provider["models"] if m["enabled"]]
    if cfg["active"]["provider_id"] == provider_id and cfg["active"]["model"] not in enabled:
        cfg["active"]["model"] = enabled[0] if enabled else ""
    _write(cfg)
    return _public_provider(provider)


def save(cfg: dict, clear_key: bool = False) -> None:
    """旧版单服务保存：更新当前服务，兼容旧接口。"""
    state = load()
    provider = active_provider(state)
    api_base = (cfg.get("api_base") or provider["api_base"]).strip()
    new_key = str(cfg.get("api_key") or "").strip()
    if (
        provider.get("api_key")
        and not new_key
        and not clear_key
        and not _same_endpoint(api_base, provider["api_base"])
    ):
        raise APIError("API 地址已变更，请重新填写该服务的 API Key")
    provider["api_base"] = api_base
    if clear_key:
        provider["api_key"] = ""
    elif new_key:
        provider["api_key"] = new_key
    provider["timeout"] = _parse_timeout(cfg.get("timeout"), provider["timeout"])
    provider["temperature"] = _parse_temperature(
        cfg.get("temperature"), provider["temperature"]
    )
    model = str(cfg.get("model") or "").strip()
    if model:
        provider["models"] = _models([model, *provider["models"]], provider["models"])
        enabled = [m["id"] for m in provider["models"] if m["enabled"]]
        if model not in enabled:
            for item in provider["models"]:
                if item["id"] == model:
                    item["enabled"] = True
        state["active"]["model"] = model
    provider["updated_at"] = _now()
    _write(state)
