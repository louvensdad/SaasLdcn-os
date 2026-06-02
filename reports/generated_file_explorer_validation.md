# Generated File Explorer Validation

Status: implemented

Validated behavior:
- Project Detail renders `Generated File Explorer`.
- Generated directories and files are indexed from the saved generated project path.
- File rows use type-aware icons for folders, code, JSON, text, and binary/archive-like files.
- Selecting a file requests backend content through `file-content`.
- Backend offline or missing generated path renders a safe error state instead of executing or guessing paths.
- Missing generated path renders an empty state telling the user to run local generation first.

Preview model:
- HTML, CSS, JS, TS, TSX, JSON, Markdown, YAML, and text files are displayed as text.
- No iframe is used.
- Generated code is never executed.
- Binary preview exposes `Unsupported preview` and the LDCN presence state `Preview blocked for binary/large file`.
