"""用户 API 配置存储。

页面右上角「API 设置」把 OpenAI 兼容接口配置保存到 db/api_config.json。
配置优先级：api_config.json > 环境变量 > 默认值。

接口只向前端返回掩码后的 Key；完整 Key 仅在服务端调用 LLM 时读取。
"""

import json
import os
import threading

from . import config

CONFIG_PATH = config.APP_DIR / "db" / "api_config.json"

DEFAULT_CONFIG = {
    "api_base": "https://api.deepseek.com",
    "api_key": "",
    "model": "deepseek-v4-flash",
    "timeout": 180,
    "temperature": 0.7,
}

_lock = threading.Lock()


def load() -> dict:
    """读取用户保存的 API 配置；文件不存在或损坏时返回空字典。"""
    if not CONFIG_PATH.exists():
        return {}
    try:
        with _lock:
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    return data if isinstance(data, dict) else {}


def save(cfg: dict, clear_key: bool = False) -> None:
    """原子写入 API 配置。

    - api_key 非空时更新；留空时保留磁盘上的旧 Key；
    - clear_key=True 时显式清空；
    - 其余字段总是写入规范化后的值。
    """
    saved = load()
    payload = {}
    for key in DEFAULT_CONFIG:
        if key == "api_key":
            if clear_key:
                payload[key] = ""
            elif cfg.get("api_key"):
                payload[key] = cfg["api_key"]
            else:
                payload[key] = saved.get("api_key", "")
        elif key in cfg and cfg[key] is not None:
            payload[key] = cfg[key]
        else:
            payload[key] = saved.get(key, DEFAULT_CONFIG[key])

    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = CONFIG_PATH.with_suffix(".json.tmp")
    with _lock:
        tmp.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        tmp.replace(CONFIG_PATH)


def effective() -> dict:
    """返回当前生效配置（api_config.json > 环境变量 > 默认值）。"""
    saved = load()

    def pick(key: str, default):
        value = saved.get(key)
        # 允许 temperature=0 这类合法的假值
        if value is not None and value != "":
            return value
        env_name = "LLM_" + key.upper()
        env_value = os.environ.get(env_name)
        if env_value is not None and env_value != "":
            return env_value
        return default

    return {
        "api_base": pick("api_base", DEFAULT_CONFIG["api_base"]),
        "api_key": pick("api_key", DEFAULT_CONFIG["api_key"]),
        "model": pick("model", DEFAULT_CONFIG["model"]),
        "timeout": float(pick("timeout", DEFAULT_CONFIG["timeout"])),
        "temperature": float(pick("temperature", DEFAULT_CONFIG["temperature"])),
    }


def llm_kwargs() -> dict:
    """返回 llm.chat() 所需的参数，统一各服务的配置来源。"""
    current = effective()
    return {
        "api_base": current["api_base"],
        "api_key": current["api_key"],
        "model": current["model"],
        "timeout": current["timeout"],
        "temperature": current["temperature"],
    }


def mask_key(key: str) -> str:
    """返回可展示的 Key 掩码；不泄露完整内容。"""
    key = (key or "").strip()
    if not key:
        return ""
    if len(key) <= 8:
        return "****"
    return f"{key[:4]}…{key[-4:]}"


def public() -> dict:
    """返回可安全发送给前端的配置（不含完整 Key）。"""
    current = effective()
    return {
        "api_base": current["api_base"],
        "model": current["model"],
        "timeout": current["timeout"],
        "temperature": current["temperature"],
        "has_key": bool(current["api_key"]),
        "api_key_masked": mask_key(current["api_key"]),
    }


def is_configured() -> bool:
    """是否已有可用的 API Key。"""
    return bool(effective()["api_key"])
