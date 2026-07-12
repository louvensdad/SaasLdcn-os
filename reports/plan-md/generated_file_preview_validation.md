# Generated File Preview Validation

Status: implemented

Backend preview controls:
- Path traversal is blocked before file resolution.
- Absolute external paths are blocked before file resolution.
- Preview is limited to 65536 bytes.
- Binary files return `preview_supported: false` with an unsupported reason.
- Secret-like files and content are blocked from preview.
- Missing generated project paths return clear errors.

Frontend preview controls:
- Selected files render in a text-only `<pre>` surface.
- Unsupported binary preview shows an explicit unsupported state.
- Offline preview failure renders a safe error state.
- Large/binary preview failures are reflected in the LDCN presence state.
