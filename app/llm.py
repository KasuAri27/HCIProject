"""OpenAI 兼容 LLM API 客户端。

使用标准库 urllib 实现，零第三方依赖。
调用规范：POST {api_base}/chat/completions，Bearer Token 鉴权。
"""

import json
import re
import urllib.error
import urllib.request
from typing import Any


class LLMError(Exception):
    """LLM API 调用失败时抛出的异常。"""


def parse_json(text: str) -> Any:
    """解析模型返回的 JSON，容忍 ```json 围栏。"""
    raw = (text or "").strip()
    fence = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```\s*$", raw, re.IGNORECASE)
    if fence:
        raw = fence.group(1).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"无法解析 LLM 返回的 JSON：{exc}") from exc


def chat(
    messages: list,
    api_base: str,
    api_key: str,
    model: str,
    timeout: float = 60.0,
    temperature: float = 0.7,
) -> str:
    """调用 OpenAI 兼容的 chat/completions 接口。

    参数:
        messages: OpenAI 消息列表，如 [{"role": "system", "content": "..."}]
        api_base: API 基础地址，如 https://api.openai.com/v1
        api_key:  API 密钥
        model:    模型名称
        timeout:  请求超时秒数
        temperature: 采样温度
    返回:
        模型回复的文本内容。
    抛出:
        LLMError: 网络错误、鉴权失败或返回异常时抛出。
    """
    if not api_key:
        raise LLMError("未配置 API Key，请先在页面右上角「API 设置」中填写，或设置环境变量 LLM_API_KEY")

    url = api_base.rstrip("/") + "/chat/completions"
    payload = json.dumps(
        {"model": model, "messages": messages, "temperature": temperature}
    ).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        # 读取服务端返回的错误详情，便于排查（如 401 鉴权失败、429 限流）
        detail = exc.read().decode("utf-8", errors="ignore")[:500]
        raise LLMError(f"LLM API 返回 HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise LLMError(f"LLM API 网络错误: {exc.reason}") from exc
    except TimeoutError as exc:
        raise LLMError(f"LLM API 请求超时（{timeout} 秒）") from exc

    try:
        return body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LLMError(f"LLM API 响应格式异常: {body}") from exc
