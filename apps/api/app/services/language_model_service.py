from __future__ import annotations

import re
import unicodedata
from typing import Final


def _key(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.strip().casefold())
    ascii_value = "".join(char for char in normalized if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", "-", ascii_value).strip("-")


GLOSSARY: Final[tuple[dict, ...]] = (
    {"term": "PromptMaster.md", "definition": "Descrição estruturada da intenção, escopo, regras e critérios do usuário.", "aliases": ["Prompt.md", "PromptMaster"]},
    {"term": "Blueprint", "definition": "Especificação técnica e estrutural que orienta planejamento e geração.", "aliases": []},
    {"term": "Plano", "definition": "Grafo ordenado de tarefas necessárias para produzir um resultado.", "aliases": []},
    {"term": "Feature", "definition": "Capacidade de produto que pode ser planejada, implementada e liberada.", "aliases": []},
    {"term": "Task", "definition": "Unidade executável de trabalho atribuída a uma Skill ou pessoa.", "aliases": []},
    {"term": "Change Request", "definition": "Pedido versionado de alteração incremental.", "aliases": []},
    {"term": "Patch", "definition": "Conjunto mínimo de mudanças aplicáveis a uma versão.", "aliases": []},
    {"term": "Build", "definition": "Transformação de uma versão em artefato executável.", "aliases": []},
    {"term": "Execution", "definition": "Instância rastreável de uma operação do sistema.", "aliases": []},
    {"term": "Runtime", "definition": "Ambiente que executa processos e serviços.", "aliases": []},
    {"term": "Preview", "definition": "Ambiente temporário para validação interativa.", "aliases": []},
    {"term": "Deploy", "definition": "Publicação de uma versão em um ambiente alvo.", "aliases": []},
    {"term": "Skill", "definition": "Executor especializado com capacidades e permissões declaradas.", "aliases": ["Agent"]},
    {"term": "Capability", "definition": "Ação que uma Skill, plugin, modelo ou ferramenta consegue realizar.", "aliases": []},
    {"term": "Contexto", "definition": "Conjunto de informações selecionadas para uma execução.", "aliases": []},
    {"term": "Memória", "definition": "Informação persistida para uso futuro conforme escopo e política.", "aliases": []},
    {"term": "Evento", "definition": "Fato imutável ocorrido na plataforma.", "aliases": []},
    {"term": "Comando", "definition": "Solicitação para que uma operação seja executada.", "aliases": []},
    {"term": "Meta-Factory", "definition": "Motor que coordena os motores estratégicos da plataforma.", "aliases": ["Meta Engine", "MetaFactory"]},
    {"term": "Plano Estudante", "definition": "Modalidade comercial do Plano Básico disponível após comprovação de matrícula vigente, com os mesmos recursos e limites.", "aliases": []},
    {"term": "Elegibilidade estudantil", "definition": "Estado verificável da matrícula do usuário, separado da assinatura e das permissões.", "aliases": []},
    {"term": "Revalidação", "definition": "Nova comprovação solicitada antes ou após o vencimento da elegibilidade.", "aliases": []},
)


class LanguageModelService:
    def __init__(self) -> None:
        self._canonical = {_key(item["term"]): item for item in GLOSSARY}
        self._aliases = {
            _key(alias): item
            for item in GLOSSARY
            for alias in item["aliases"]
        }

    @staticmethod
    def _view(item: dict) -> dict:
        return {"id": _key(item["term"]), **item}

    def glossary(self) -> list[dict]:
        return [self._view(item) for item in GLOSSARY]

    def resolve(self, term: str) -> dict | None:
        normalized = _key(term)
        item = self._canonical.get(normalized)
        if item is not None:
            return {**self._view(item), "input": term, "is_alias": False}
        item = self._aliases.get(normalized)
        if item is not None:
            return {**self._view(item), "input": term, "is_alias": True}
        return None

    def validate(self, terms: list[str]) -> dict:
        unknown: list[str] = []
        aliases: list[dict[str, str]] = []
        for term in terms:
            resolved = self.resolve(term)
            if resolved is None:
                unknown.append(term)
            elif resolved["is_alias"]:
                aliases.append({"alias": term, "canonical_term": resolved["term"]})
        return {"valid": not unknown, "unknown_terms": unknown, "legacy_aliases": aliases}


language_model_service = LanguageModelService()
