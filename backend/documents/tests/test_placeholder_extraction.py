from django.test import SimpleTestCase

from template_engine.cache import parse_template_cached
from template_engine.collector import collect_variables_with_locations
from template_engine.errors import TemplateEngineError


class PlaceholderExtractionTests(SimpleTestCase):
    def test_collects_variables_with_ranges(self):
        ast = parse_template_cached("Hello {{ user.name }} and {{assets.logo}}")
        result = collect_variables_with_locations(ast)
        self.assertIn("user.name", result)
        self.assertIn("assets.logo", result)
        self.assertGreaterEqual(len(result["user.name"]), 1)

    def test_invalid_placeholder_raises_structured_error(self):
        with self.assertRaises(TemplateEngineError):
            parse_template_cached("{{ invalid path }}")

    def test_collects_legacy_asset_aliases_as_canonical_keys(self):
        ast = parse_template_cached("Logo: [LOGO], Signature: [SIGNATURE]")
        result = collect_variables_with_locations(ast)
        self.assertIn("assets.logo", result)
        self.assertIn("assets.signature", result)

    def test_collects_internal_asset_sentinel_aliases_as_canonical_keys(self):
        ast = parse_template_cached("Logo: __ASSET_LOGO__ and __ASSET_SIGNATURE__")
        result = collect_variables_with_locations(ast)
        self.assertIn("assets.logo", result)
        self.assertIn("assets.signature", result)

    def test_collects_sized_asset_placeholders_as_canonical_keys(self):
        ast = parse_template_cached("Logo: {{assets.logo|w:200|h:80}}")
        result = collect_variables_with_locations(ast)
        self.assertIn("assets.logo", result)
