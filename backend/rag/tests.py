from django.test import SimpleTestCase

from rag.services.retrieval import rrf_merge


class RetrievalRrfTests(SimpleTestCase):
    def test_rrf_merge_is_deterministic_with_tie_break(self):
        vector_rows = [
            {"chunk_id": "b", "text": "b"},
            {"chunk_id": "a", "text": "a"},
        ]
        fts_rows = [
            {"chunk_id": "a", "text": "a"},
            {"chunk_id": "b", "text": "b"},
        ]

        merged_first = rrf_merge(vector_rows, fts_rows, top_n=10)
        merged_second = rrf_merge(vector_rows, fts_rows, top_n=10)

        self.assertEqual(
            [row["chunk_id"] for row in merged_first],
            [row["chunk_id"] for row in merged_second],
        )
        self.assertEqual(sorted([row["chunk_id"] for row in merged_first]), ["a", "b"])
