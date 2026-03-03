from django.test import SimpleTestCase

from template_engine.cache import parse_template_cached
from template_engine.renderer import render


class RenderTests(SimpleTestCase):
    def test_required_missing_returns_error_with_range(self):
        ast = parse_template_cached("{{user.name}}")
        result = render(
            ast,
            {},
            required_variables={"user.name"},
            fail_fast_on_required=False,
            preserve_unresolved=True,
        )
        self.assertEqual(len(result.errors), 1)
        self.assertEqual(result.errors[0].code, "MISSING_REQUIRED")
        self.assertEqual(result.output, "{{user.name}}")

    def test_legacy_asset_alias_token_renders_via_canonical_key(self):
        ast = parse_template_cached("Logo [LOGO]")
        result = render(
            ast,
            {"assets.logo": "/api/v1/handbooks/hb-1/assets/logo/download"},
            required_variables={"assets.logo"},
            fail_fast_on_required=False,
            preserve_unresolved=True,
        )
        self.assertEqual(len(result.errors), 0)
        self.assertIn("/api/v1/handbooks/hb-1/assets/logo/download", result.output)

    def test_internal_asset_alias_token_renders_via_canonical_key(self):
        ast = parse_template_cached("Logo __ASSET_LOGO__")
        result = render(
            ast,
            {"assets.logo": "logo-bytes-placeholder"},
            required_variables={"assets.logo"},
            fail_fast_on_required=False,
            preserve_unresolved=True,
        )
        self.assertEqual(len(result.errors), 0)
        self.assertIn("logo-bytes-placeholder", result.output)

    def test_mustache_asset_token_with_size_options_renders_via_canonical_key(self):
        ast = parse_template_cached("Logo {{assets.logo|w:220|h:90}}")
        result = render(
            ast,
            {"assets.logo": "logo-binary"},
            required_variables={"assets.logo"},
            fail_fast_on_required=False,
            preserve_unresolved=True,
        )
        self.assertEqual(len(result.errors), 0)
        self.assertIn("logo-binary", result.output)
