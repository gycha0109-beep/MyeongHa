"""Validate real response import without committing real user transcripts."""
import json
import pathlib
import tempfile
import unittest
from yeoul_dspy_actual_corpus import EXPECTED_IDS, export_dspy_examples, load_pairs, summarize

def synthetic_data():
    return {
        "model": "openai/gpt-6-luna",
        "status": "ACTUAL_REPLIES_UNREVIEWED",
        "plannedCalls": 18,
        "completedCalls": 18,
        "rows": [
            {
                "id": key,
                "message": "가상 질문: " + key,
                "relationship": "close" if key == "interest_confirmed" else
                                "acquaintance" if key in {"desk","praise","rivalry","hurt"} else "unknown",
                "verifiedEventCount": 1 if key == "interest_confirmed" else 0,
                "v5": {"text": "합성 v5 응답: " + key},
                "v6": {"text": "합성 v6 응답: " + key},
            }
            for key in EXPECTED_IDS
        ],
    }

class CorpusTests(unittest.TestCase):
    def write(self, data):
        temp = tempfile.TemporaryDirectory()
        path = pathlib.Path(temp.name) / "synthetic.json"
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        self.addCleanup(temp.cleanup)
        return path

    def test_import_records_real_format_without_human_labels(self):
        path = self.write(synthetic_data())
        pairs = load_pairs(path)
        examples = export_dspy_examples(pairs)
        summary = summarize(pairs, path)
        self.assertEqual(len(examples), 9)
        self.assertEqual(len(examples[0].inputs()), 3)
        self.assertEqual(summary["responses"], 18)
        self.assertEqual(summary["human_ratings"], 0)
        self.assertFalse(summary["gepa_learning_ready"])

    def test_rejects_partial_results(self):
        data = synthetic_data()
        data["completedCalls"] = 17
        with self.assertRaisesRegex(ValueError, "incomplete_18_calls"):
            load_pairs(self.write(data))

    def test_rejects_missing_answer(self):
        data = synthetic_data()
        data["rows"][2]["v6"]["text"] = ""
        with self.assertRaisesRegex(ValueError, "missing_answer"):
            load_pairs(self.write(data))

    def test_rejects_duplicate_ids(self):
        data = synthetic_data()
        data["rows"][0]["id"] = "socks"
        with self.assertRaisesRegex(ValueError, "wrong_scenario_ids"):
            load_pairs(self.write(data))

if __name__ == "__main__":
    unittest.main()
