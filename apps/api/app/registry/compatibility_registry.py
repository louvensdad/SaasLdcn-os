from __future__ import annotations

from collections.abc import Sequence

COMPATIBILITY_RULES: list[dict] = [
    {"id": "rule-spring-java-jvm", "source_type": "framework", "source_id": "spring_boot", "target_type": "runtime", "target_id": "jvm", "rule_type": "requires", "severity": "error", "message": "Spring Boot requires the JVM runtime.", "suggestion": "Select Java with the JVM runtime."},
    {"id": "rule-jvm-java", "source_type": "runtime", "source_id": "jvm", "target_type": "language", "target_id": "java", "rule_type": "requires", "severity": "error", "message": "The JVM runtime belongs to the Java ecosystem.", "suggestion": "Select Java before selecting JVM."},
    {"id": "rule-nestjs-node", "source_type": "framework", "source_id": "nestjs", "target_type": "runtime", "target_id": "nodejs", "rule_type": "requires", "severity": "error", "message": "NestJS requires Node.js.", "suggestion": "Select Node.js as the runtime."},
    {"id": "rule-nextjs-frontend", "source_type": "framework", "source_id": "nextjs", "target_type": "archetype", "target_id": "landing_page", "rule_type": "supports", "severity": "info", "message": "Next.js is well-suited for frontend and full-stack product archetypes.", "suggestion": "Use frontend or application archetypes with Next.js."},
    {"id": "rule-react-backend-block", "source_type": "framework", "source_id": "react", "target_type": "archetype", "target_id": "rest_api", "rule_type": "disallows", "severity": "error", "message": "React alone does not support backend archetypes.", "suggestion": "Pair React with a backend framework or choose a backend-capable framework."},
    {"id": "rule-ai-saas-chat", "source_type": "archetype", "source_id": "ai_saas", "target_type": "capability", "target_id": "ai_chat", "rule_type": "recommends", "severity": "warning", "message": "AI SaaS usually expects conversational AI capabilities.", "suggestion": "Add ai_chat."},
    {"id": "rule-ai-saas-websocket", "source_type": "archetype", "source_id": "ai_saas", "target_type": "capability", "target_id": "websocket", "rule_type": "recommends", "severity": "warning", "message": "AI SaaS often benefits from live streaming or realtime capability.", "suggestion": "Add websocket for more interactive product experiences."},
    {"id": "rule-microservices-docker", "source_type": "architecture", "source_id": "microservices", "target_type": "capability", "target_id": "docker", "rule_type": "requires", "severity": "error", "message": "Microservices require container readiness.", "suggestion": "Add docker."},
    {"id": "rule-microservices-observability", "source_type": "architecture", "source_id": "microservices", "target_type": "capability", "target_id": "observability", "rule_type": "recommends", "severity": "warning", "message": "Microservices strongly benefit from observability.", "suggestion": "Add observability."},
    {"id": "rule-microservices-queue", "source_type": "architecture", "source_id": "microservices", "target_type": "capability", "target_id": "queue", "rule_type": "recommends", "severity": "warning", "message": "Microservices commonly benefit from queue-based async coordination.", "suggestion": "Add queue."},
    {"id": "rule-ai-chat-endpoint", "source_type": "endpoint", "source_id": "ai.chat", "target_type": "capability", "target_id": "ai_chat", "rule_type": "requires", "severity": "error", "message": "The ai.chat endpoint requires the ai_chat capability.", "suggestion": "Add ai_chat or remove ai.chat."},
]


def get_compatibility_registry() -> Sequence[dict]:
    return COMPATIBILITY_RULES
