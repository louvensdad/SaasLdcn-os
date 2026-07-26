from __future__ import annotations

from app.services.artifact_security import (
    ArtifactSecurityError,
    artifact_block_reason,
    assert_artifact_safe,
    classify_secret_findings,
    sanitize_untrusted_source,
)

import pytest


def _classification(path: str, content: str) -> str | None:
    findings = classify_secret_findings(path, content)
    return findings[0].classification if findings else None


class TestRealSecret:
    def test_hardcoded_hex_secret_key_is_blocked(self):
        # The exact reported scenario: SECRET_KEY assigned a real-looking
        # 32-char literal directly in an application service.
        content = 'SECRET_KEY = "9f8a3b2c7d1e4f6a0b5c8d2e1f4a7b9c"\n'
        assert _classification("backend/app/application/services/auth_service.py", content) == "REAL_SECRET"
        assert artifact_block_reason("backend/app/application/services/auth_service.py", content) != ""

    def test_mixed_charset_secret_is_blocked(self):
        content = 'SECRET_KEY = "Xk9#mP2$vQ7nZ4wR8tY1uL5cB3sA6dF0"\n'
        assert _classification("backend/app/core/config.py", content) == "REAL_SECRET"

    def test_known_aws_key_format_blocks_regardless_of_path(self):
        # A real-shaped AWS key blocks even inside a test/docs path -- known
        # credential formats are never softened by context.
        content = 'AWS_KEY = "AKIAIOSFODNN7ABCDEFGH"\n'
        assert _classification("tests/fixtures/config.py", content) == "REAL_SECRET"
        assert _classification("docs/setup.md", content) == "REAL_SECRET"

    def test_openai_style_key_blocks(self):
        content = 'OPENAI_API_KEY = "sk-proj-abcdefghijklmnopqrstuvwx1234567890"\n'
        assert artifact_block_reason("backend/app/core/config.py", content) != ""

    def test_pem_private_key_blocks(self):
        content = "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK...\n-----END RSA PRIVATE KEY-----\n"
        assert artifact_block_reason("backend/app/core/keys.py", content) != ""


class TestPlaceholder:
    def test_change_me_is_not_blocked(self):
        content = 'SECRET_KEY = "change-me"\n'
        assert _classification("backend/app/core/config.py", content) == "PLACEHOLDER"
        assert artifact_block_reason("backend/app/core/config.py", content) == ""

    def test_your_prefixed_placeholder_is_not_blocked(self):
        content = "JWT_SECRET=your-256-bit-secret-key-here-must-be-at-least-256-bits-long\n"
        assert _classification("backend/.env.example", content) == "PLACEHOLDER"
        assert artifact_block_reason("backend/.env.example", content) == ""

    def test_stub_prefixed_mock_values_are_not_blocked(self):
        # Real bug found live: a generated StubAuthService's mock token/id
        # literals were flagged as UNSAFE_TEMPLATE (needing human approval)
        # on every generation that produces a stub service.
        for content in (
            'return TokenResponse(access_token="stub-access-token", refresh_token="stub-refresh-token")\n',
            'return TokenResponse(access_token="new-stub-access-token", refresh_token="new-stub-refresh-token")\n',
            'return UserResponse(id="stub-user-id", username=request.username)\n',
        ):
            assert artifact_block_reason("backend/app/auth/application/auth_service.py", content) == "", content

    def test_suffixed_placeholder_word_is_detected(self):
        # "example1234..." has no word boundary between "example" and the
        # following digits -- must still be recognized as a placeholder.
        content = "SECRET_KEY=example1234567890abcdef\n"
        assert _classification("docs/setup.md", content) == "DOCUMENTATION_EXAMPLE"

    def test_pydantic_field_default_placeholder_is_not_blocked(self):
        content = 'JWT_SECRET: str = Field(default="change-me")\n'
        assert artifact_block_reason("backend/app/core/config.py", content) == ""

    def test_pydantic_field_description_is_never_mistaken_for_the_value(self):
        # Real bug found live: a required field's `description=` kwarg (pure
        # documentation, no literal default at all) was being scanned as if it
        # were the field's own secret value, because it was simply the first
        # quoted string on the line. "Token de atualizacao (refresh token)" is
        # long/diverse enough in Portuguese to clear the entropy heuristic on
        # its own, so this isn't a placeholder-wording escape -- it must never
        # reach the classifier as a candidate value in the first place.
        content = (
            'refresh_token: str = Field(..., description="Token de atualizacao (refresh token)")\n'
        )
        assert _classification("backend/app/schemas/__init__.py", content) == "SAFE_REFERENCE"
        assert artifact_block_reason("backend/app/schemas/__init__.py", content) == ""

    def test_pydantic_field_default_factory_is_not_mistaken_for_a_literal(self):
        content = 'session_id: str = Field(default_factory=lambda: str(uuid4()), description="Session identifier")\n'
        assert artifact_block_reason("backend/app/schemas/session.py", content) == ""

    def test_pydantic_field_actual_default_literal_still_blocks(self):
        # The fix must not blanket-exempt every Field(...) call -- a real
        # hardcoded secret assigned via `default=` is still caught.
        content = 'API_KEY: str = Field(default="Xk9#mP2$vQ7nZ4wR8tY1uL5cB3sA6dF0", description="API key")\n'
        assert _classification("backend/app/core/config.py", content) == "REAL_SECRET"

    def test_except_clause_naming_a_token_error_does_not_swallow_the_next_line(self):
        # Real bug found live: `except jwt.InvalidTokenError:` is a Python
        # control-flow line ending in ':', not an assignment -- but `\s*`
        # (which matches '\n' too) let the old regex cross the newline and
        # read the NEXT line's `raise ValueError("Token invalido")` as if it
        # were the value assigned to a "token" credential.
        content = (
            "def validate_token(self, token: str) -> dict:\n"
            "    try:\n"
            "        return jwt.decode(token, self._secret)\n"
            "    except jwt.InvalidTokenError:\n"
            '        raise ValueError("Token invalido")\n'
        )
        assert artifact_block_reason("backend/app/user/application/token_service.py", content) == ""

    def test_class_named_after_a_secret_word_does_not_swallow_its_first_statement(self):
        content = (
            "class SecretRotationPolicy:\n"
            '    """Docstring unrelated to any real value."""\n'
        )
        assert artifact_block_reason("backend/app/core/policy.py", content) == ""

    def test_ordinary_long_string_that_is_not_credential_shaped_is_safe(self):
        # Real bug found live: a Zod validation-message string landed on a
        # `password: ...` line and, despite `_looks_like_usable_credential`
        # correctly determining it doesn't look like a working secret (no
        # digits/uppercase, plain snake_case English), the default branch
        # still fell through to SUSPICIOUS -- blocking on ordinary UI/
        # validation copy, not just real ambiguous secrets.
        content = "  password: z.string().min(1, 'validation_required'),\n"
        assert _classification("src/pages/LoginPage.tsx", content) == "SAFE_REFERENCE"
        assert artifact_block_reason("src/pages/LoginPage.tsx", content) == ""


class TestTestFixture:
    def test_placeholder_in_test_path_is_test_fixture(self):
        content = 'API_KEY = "test-key-1234567890abcdef"\n'
        assert _classification("tests/fixtures/auth.py", content) == "TEST_FIXTURE"

    def test_high_entropy_value_in_test_path_stays_suspicious(self):
        # A test path does not blanket-exempt genuinely random-looking values.
        content = 'API_KEY = "Xk9#mP2$vQ7nZ4wR8tY1uL5cB3sA6dF0"\n'
        assert _classification("tests/fixtures/auth.py", content) == "SUSPICIOUS"


class TestDocumentationExample:
    def test_placeholder_in_readme_is_documentation_example(self):
        content = "Set SECRET_KEY=example1234567890abcdef in your .env\n"
        assert _classification("README.md", content) == "DOCUMENTATION_EXAMPLE"


class TestSafeReference:
    def test_env_getenv_reference_is_safe(self):
        content = 'SECRET_KEY = os.getenv("SECRET_KEY")\n'
        assert _classification("backend/app/core/config.py", content) == "SAFE_REFERENCE"
        assert artifact_block_reason("backend/app/core/config.py", content) == ""

    def test_java_value_annotation_reference_is_safe(self):
        content = '@Value("${app.jwt.secret}")\nprivate String jwtSecret;\n'
        assert artifact_block_reason("Backend/src/main/java/Config.java", content) == ""

    def test_short_value_is_safe(self):
        content = 'TOKEN = "abc"\n'
        assert _classification("backend/app/core/config.py", content) == "SAFE_REFERENCE"

    def test_bare_variable_to_variable_assignment_is_not_flagged(self):
        # An unquoted RHS in source code is a variable/attribute reference,
        # not a string literal -- must not be scored as a secret by entropy.
        content = "    self.password = incoming_password_value_from_request\n"
        assert _classification("backend/app/application/services/auth_service.py", content) == "SAFE_REFERENCE"

    def test_function_signature_is_not_flagged(self):
        content = "def verify(self, password: str, hashed: str) -> bool:\n    return pwd_context.verify(password, hashed)\n"
        assert artifact_block_reason("backend/app/application/services/auth_service.py", content) == ""


class TestSuspicious:
    def test_ambiguous_unquoted_env_value_still_blocks(self):
        # A long, moderate-entropy bare value inside a real .env-style file
        # (not a template) cannot be confirmed as either placeholder or real
        # secret from content alone -- stays fail-safe.
        content = "SESSION_SECRET=aVeryLongButNotObviouslyRandomToken123\n"
        classification = _classification("backend/config.properties", content)
        assert classification in {"SUSPICIOUS", "REAL_SECRET"}
        assert artifact_block_reason("backend/config.properties", content) != ""


class TestScannerNeverGloballyDisabled:
    def test_real_secret_still_blocks_inside_test_and_doc_paths(self):
        # The context-sensitivity is for *ambiguous* values only -- a
        # known-format real credential is never exempted by location.
        real_key = 'AWS_KEY = "AKIAIOSFODNN7ABCDEFGH"\n'
        for path in ("tests/fixtures/x.py", "docs/example.md", "backend/.env.example"):
            assert artifact_block_reason(path, real_key) != "", f"real secret was not blocked at {path}"

    def test_assert_artifact_safe_still_raises_for_real_secret(self):
        with pytest.raises(ArtifactSecurityError):
            assert_artifact_safe("backend/app/core/config.py", 'SECRET_KEY = "Xk9#mP2$vQ7nZ4wR8tY1uL5cB3sA6dF0"\n')

    def test_real_env_file_still_hard_blocked_by_name(self):
        assert artifact_block_reason(".env", "ANYTHING=whatever\n") != ""

    def test_private_key_file_still_hard_blocked_by_name(self):
        assert artifact_block_reason("id_rsa", "irrelevant") != ""


class TestBackwardCompatibility:
    def test_sanitize_then_classify_round_trip_stays_clean(self):
        source = 'API_KEY = "AKIAIOSFODNN7EXAMPLE12"\nPASSWORD = "supersecret123456789"\n'
        sanitized = sanitize_untrusted_source(source)
        assert 'API_KEY = "change-me"' in sanitized
        assert 'PASSWORD = "change-me"' in sanitized
        assert artifact_block_reason("settings.py", sanitized) == ""
