import pytest
from app.validators.password import validate_password, sanitize_string
from app.validators.plan import can_start_instance, can_create_macro, get_plan_limit


class TestPasswordValidator:
    def test_valid_password(self):
        assert validate_password("Str0ngPass") is True
        assert validate_password("MyP@ssw0rd") is True

    def test_too_short(self):
        assert validate_password("Ab1") is False
        assert validate_password("Abc123") is False  # len 6

    def test_no_uppercase(self):
        assert validate_password("abcdefgh1") is False

    def test_no_lowercase(self):
        assert validate_password("ABCDEFGH1") is False

    def test_no_digit(self):
        assert validate_password("Abcdefgh") is False


class TestSanitizeString:
    def test_escape_html(self):
        assert sanitize_string("<script>alert('xss')</script>") == "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;"

    def test_truncate(self):
        long_str = "a" * 2000
        assert len(sanitize_string(long_str, max_length=100)) == 100

    def test_normal_string(self):
        assert sanitize_string("Hello world") == "Hello world"


class TestPlanValidator:
    def test_get_plan_limit(self):
        assert get_plan_limit("free", "max_instances") == 1
        assert get_plan_limit("pro", "max_macros") == 50
        assert get_plan_limit("unknown", "max_instances") is None

    def test_can_start_instance(self):
        assert can_start_instance("free", 0) is True
        assert can_start_instance("free", 1) is False
        assert can_start_instance("starter", 2) is True
        assert can_start_instance("starter", 3) is False

    def test_can_create_macro(self):
        assert can_create_macro("free", 0) is True
        assert can_create_macro("free", 3) is False
        assert can_create_macro("pro", 49) is True
        assert can_create_macro("pro", 50) is False
        assert can_create_macro("unknown", 0) is False