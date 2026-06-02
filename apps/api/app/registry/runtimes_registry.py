from __future__ import annotations

from collections.abc import Sequence

RUNTIMES: list[dict] = [
    {
        "id": "jvm",
        "name": "JVM",
        "language_id": "java",
        "description": "Managed virtual machine runtime for Java enterprise systems.",
        "supported_frameworks": ["spring_boot", "quarkus", "micronaut"],
        "deployment_profiles": ["local_first", "container", "vm"],
        "performance_profile": "high",
    },
    {
        "id": "nodejs",
        "name": "Node.js",
        "language_id": "typescript",
        "description": "Event-loop runtime for TypeScript and JavaScript backend and full-stack frameworks.",
        "supported_frameworks": ["nestjs", "nextjs", "express", "fastify", "react"],
        "deployment_profiles": ["local_first", "container", "serverless", "edge"],
        "performance_profile": "high",
    },
    {
        "id": "bun",
        "name": "Bun",
        "language_id": "typescript",
        "description": "Fast JavaScript and TypeScript runtime with integrated tooling.",
        "supported_frameworks": ["express", "fastify", "react"],
        "deployment_profiles": ["local_first", "container", "edge"],
        "performance_profile": "very_high",
    },
    {
        "id": "deno",
        "name": "Deno",
        "language_id": "typescript",
        "description": "Secure JavaScript and TypeScript runtime for APIs and edge-style services.",
        "supported_frameworks": ["express", "fastify", "react"],
        "deployment_profiles": ["local_first", "container", "serverless", "edge"],
        "performance_profile": "high",
    },
    {
        "id": "python_runtime",
        "name": "Python Runtime",
        "language_id": "python",
        "description": "Standard Python application runtime for APIs and service applications.",
        "supported_frameworks": ["fastapi", "django", "flask"],
        "deployment_profiles": ["local_first", "container", "serverless"],
        "performance_profile": "moderate",
    },
    {
        "id": "dotnet_runtime",
        "name": ".NET Runtime",
        "language_id": "csharp",
        "description": "Managed runtime for enterprise-grade .NET services and apps.",
        "supported_frameworks": ["aspnet_core", "blazor"],
        "deployment_profiles": ["local_first", "container", "vm"],
        "performance_profile": "high",
    },
    {
        "id": "php_runtime",
        "name": "PHP Runtime",
        "language_id": "php",
        "description": "Server-side PHP runtime for web applications and APIs.",
        "supported_frameworks": ["laravel"],
        "deployment_profiles": ["local_first", "container", "serverless"],
        "performance_profile": "moderate",
    },
    {
        "id": "go_runtime",
        "name": "Go Runtime",
        "language_id": "go",
        "description": "Compiled Go execution model for high-throughput services.",
        "supported_frameworks": ["fiber", "gin"],
        "deployment_profiles": ["local_first", "container", "serverless"],
        "performance_profile": "very_high",
    },
]


def get_runtimes_registry() -> Sequence[dict]:
    return RUNTIMES
