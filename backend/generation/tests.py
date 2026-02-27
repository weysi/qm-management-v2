from django.test import SimpleTestCase

from generation.services.execution import _build_effective_map
from rag.models import RagVariableValue


class VariablePrecedenceTests(SimpleTestCase):
    def test_customer_input_is_not_overridden(self):
        base = {
            "COMPANY_NAME": "Customer GmbH",
            "SCOPE": "Initial scope",
        }
        source_by_token = {
            "COMPANY_NAME": RagVariableValue.Source.CUSTOMER_INPUT,
            "SCOPE": RagVariableValue.Source.DEFAULT,
        }
        merged = _build_effective_map(
            base_values=base,
            source_by_token=source_by_token,
            global_overrides={
                "COMPANY_NAME": "Override GmbH",
                "SCOPE": "Global scope",
            },
            file_overrides={"SCOPE": "File scope"},
        )

        self.assertEqual(merged["COMPANY_NAME"], "Customer GmbH")
        self.assertEqual(merged["SCOPE"], "File scope")
