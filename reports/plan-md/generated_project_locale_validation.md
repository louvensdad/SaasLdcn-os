# Generated Project Locale Validation

- Local static templates use localized README keys.
- Backend generation localizes README labels, safety text, and `.env.example` description.
- Template manifests declare all four supported locales and `en-US` fallback.
- Generated project locale settings are represented by `GeneratedProjectLocaleProfile`.
- Locale profile is propagated through Blueprint, Prompt Master, Gatekeeper, local generation, and backend generation.
- Localized README rendering regression test: passed.
