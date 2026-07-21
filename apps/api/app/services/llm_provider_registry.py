from __future__ import annotations

from dataclasses import dataclass

from app.data.model_registry import MODEL_REGISTRY


@dataclass(frozen=True)
class ProviderDefinition:
    id: str
    label: str
    default_model: str
    key_required: bool = True


PROVIDERS: dict[str, ProviderDefinition] = {
    "openai": ProviderDefinition("openai", "OpenAI / GPT", "gpt-4.1"),
    "anthropic": ProviderDefinition("anthropic", "Claude", "claude-sonnet-4-6"),
    "google": ProviderDefinition("google", "Gemini", "gemini-2.5-pro"),
    "deepseek": ProviderDefinition("deepseek", "DeepSeek", "deepseek-chat"),
    "openrouter": ProviderDefinition("openrouter", "OpenRouter", "deepseek/deepseek-chat"),
    "groq": ProviderDefinition("groq", "Groq", "llama-3.3-70b-versatile"),
    "ollama": ProviderDefinition("ollama", "Ollama local", "qwen2.5-coder:7b", False),
    "lmstudio": ProviderDefinition("lmstudio", "LM Studio", "local-model", False),
}

PROVIDER_ALIASES: dict[str, str] = {
    "openai": "openai", "gpt": "openai", "chatgpt": "openai",
    "anthropic": "anthropic", "claude": "anthropic",
    "google": "google", "gemini": "google", "google-ai": "google",
    "google_ai": "google", "google-genai": "google", "google_genai": "google",
    "deepseek": "deepseek", "openrouter": "openrouter", "open-router": "openrouter",
    "groq": "groq",
    "ollama": "ollama", "local": "ollama",
    "lmstudio": "lmstudio", "lm-studio": "lmstudio", "lm_studio": "lmstudio",
}


def normalize_provider_id(value: str) -> str:
    normalized = PROVIDER_ALIASES.get(value.strip().lower())
    if normalized is None:
        raise ValueError(f"Unsupported LLM provider '{value}'.")
    return normalized


def provider_for_model(model: str | None) -> str | None:
    if not model:
        return None
    provider = MODEL_REGISTRY.get(model, {}).get("provider")
    if not provider or provider == "custom":
        return provider
    return normalize_provider_id(str(provider))
