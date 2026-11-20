"""Regression tests for genuine (not fabricated) Yeoul human-rating feedback."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from yeoul_dspy_actual_corpus import EXPECTED_IDS
from yeoul_human_gepa_feedback import feedback, render_html, validate_review


class HumanFeedbackTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.src = Path(self.tmp.name) / "pairs.json"
        self.src.write_text(json.dumps({
            "model": "openai/gpt-6-luna", "completedCalls": 18, "plannedCalls": 18,
            "rows": [{
                "id": cid, "message": "가상 상황 " + cid,
                "relationship": "close" if cid == "interest_confirmed" else "unknown",
                "verifiedEventCount": 1 if cid == "interest_confirmed" else 0,
                "v5": {"text": "합성 응답 V5 " + cid},
                "v6": {"text": "합성 응답 V6 " + cid}
            } for cid in EXPECTED_IDS]
        }, ensure_ascii=False), encoding="utf-8")
        self.review = {
            "source_sha256": hashlib.sha256(self.src.read_bytes()).hexdigest(),
            "status": "UNREVIEWED",
            "cases": [{
                "id": cid, "preferred": None, "reason": "",
                "natural_korean_v5": None, "natural_korean_v6": None,
                "yeoul_character_v5": None, "yeoul_character_v6": None,
                "hard_failures_v5": [], "hard_failures_v6": []
            } for cid in EXPECTED_IDS]
        }

    def test_unreviewed_cannot_be_training_labels(self):
        r = feedback(self.review, self.src)
        self.assertEqual(r["reviewed_cases"], 0)
        self.assertFalse(r["can_use_as_gepa_development_feedback"])
        self.assertEqual(r["scores"], [])

    def test_real_human_scores_produce_bounded_feedback(self):
        self.review["status"] = "HUMAN_REVIEWED"
        for row in self.review["cases"]:
            row.update(preferred="v6", natural_korean_v5=3,
                       natural_korean_v6=4, yeoul_character_v5=2,
                       yeoul_character_v6=4, reason="synthetic judge")
        self.review["cases"][0]["hard_failures_v6"] = ["unsafe_advice"]
        result = feedback(self.review, self.src)
        self.assertTrue(result["can_use_as_gepa_development_feedback"])
        self.assertEqual(result["reviewed_cases"], 9)
        self.assertEqual(result["scores"][0]["v6"]["score"], 0)
        self.assertEqual(result["scores"][1]["v6"]["score"], 1.0)
        self.assertEqual(result["scores"][1]["v5"]["score"], 0.5625)
        self.assertNotIn("synthetic judge", json.dumps(result))

    def test_partial_stays_incomplete(self):
        self.review["status"] = "PARTIAL"
        self.review["cases"][0].update(preferred="v5", natural_korean_v5=4,
                                       natural_korean_v6=3, yeoul_character_v5=4,
                                       yeoul_character_v6=3)
        r = feedback(self.review, self.src)
        self.assertFalse(r["can_use_as_gepa_development_feedback"])
        self.assertEqual(r["reviewed_cases"], 1)

    def test_rating_type_hard_rejected(self):
        self.review["cases"][0]["natural_korean_v5"] = True
        with self.assertRaisesRegex(ValueError, "rating_range"):
            feedback(self.review, self.src)

    def test_mismatched_source_rejected(self):
        self.review["source_sha256"] = "a"*64
        with self.assertRaisesRegex(ValueError, "source_hash_mismatch"):
            feedback(self.review, self.src)

    def test_render_has_nine_case_sections_and_local_export(self):
        path = Path(self.tmp.name) / "human-review.html"
        render_html(self.src, path)
        text = path.read_text(encoding="utf-8")
        self.assertEqual(text.count('<section data-case='), 9)
        self.assertIn("Blob(", text)
        self.assertIn("여울", text)
        self.assertNotIn("fetch(", text)


if __name__ == "__main__":
    unittest.main()
