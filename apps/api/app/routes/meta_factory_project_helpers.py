from __future__ import annotations

def generated_file_paths(project_id: str, service: object, project_factory, excluded_files: set[str]) -> list[str]:
    listing = service.list_files(project_factory(project_id))
    return [
        str(item["relative_path"])
        for item in listing.get("files", [])
        if item.get("relative_path") not in excluded_files
    ]

