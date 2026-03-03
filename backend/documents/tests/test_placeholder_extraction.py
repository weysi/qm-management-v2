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
