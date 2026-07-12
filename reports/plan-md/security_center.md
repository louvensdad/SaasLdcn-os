# Security Center

## Implemented

- Uses the deterministic codebase scan from `codebase_analysis_engine`.
- Reports real findings with severity, code, message, file and line when available.
- Secrets, private keys, hardcoded tokens and dangerous eval/exec patterns are derived from inspected source files.

## Auto Fix

The UI reserves the module for preview-and-confirm correction flow. No automatic patch is applied without user review.
