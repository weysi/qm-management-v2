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
