from django.test import SimpleTestCase

from common.chunking import ChunkConfig, split_text_deterministic
from common.hashing import sha256_text
from common.placeholders import count_placeholder_tokens, extract_placeholder_tokens


class PlaceholderExtractionTests(SimpleTestCase):
    def test_extract_and_count_placeholders(self):
        text = "A {{COMPANY_NAME}} B {{SCOPE}} C {{COMPANY_NAME}}"
        tokens = extract_placeholder_tokens(text)
        counts = count_placeholder_tokens(text)

        self.assertEqual(tokens, ["COMPANY_NAME", "SCOPE", "COMPANY_NAME"])
        self.assertEqual(counts["COMPANY_NAME"], 2)
        self.assertEqual(counts["SCOPE"], 1)


class DeterministicChunkingTests(SimpleTestCase):
    def test_same_input_yields_same_chunk_hashes(self):
        text = (
            "Paragraph one.\n\n"
            "Paragraph two with more content.\n\n"
            "Paragraph three with even more content."
        )
        config = ChunkConfig(target_chars=40, overlap_chars=8)
        first = split_text_deterministic(text, config)
        second = split_text_deterministic(text, config)

        self.assertEqual(first, second)
        self.assertEqual(
            [sha256_text(chunk) for chunk in first],
            [sha256_text(chunk) for chunk in second],
        )
