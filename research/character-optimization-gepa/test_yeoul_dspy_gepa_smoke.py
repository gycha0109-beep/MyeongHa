"""Regression checks for the paid-free DSPy/GEPA adapter."""
import json
import os
import pathlib
import subprocess
import sys
import unittest

SCRIPT = pathlib.Path(__file__).with_name("yeoul_dspy_gepa_smoke.py")

class DspyGepaSmokeTests(unittest.TestCase):
    def test_genuine_dspy_gepa_offline_smoke(self):
        env = os.environ.copy()
        env.pop("OPENROUTER_API_KEY", None)
        env.pop("OPENAI_API_KEY", None)
        env["PYTHONIOENCODING"] = "utf-8"
        p = subprocess.run([sys.executable, str(SCRIPT), "--smoke"],
                           text=True, capture_output=True, timeout=40,
                           env=env, encoding="utf-8")
        self.assertEqual(p.returncode, 0, p.stderr[-2000:])
        record = json.loads(p.stdout.strip().splitlines()[-1])
        self.assertEqual(record["optimizer"], "dspy.GEPA")
        self.assertEqual(record["actual_provider_calls"], 0)
        self.assertFalse(record["real_style_improvement_proven"])
        self.assertFalse(record["production_eligible"])
        self.assertTrue(record["only_expression_slot"])

    def test_no_paid_key_allowed_even_in_smoke(self):
        env = os.environ.copy()
        env["OPENROUTER_API_KEY"] = "should-not-be-used"
        p = subprocess.run([sys.executable, str(SCRIPT), "--smoke"],
                           text=True, capture_output=True, timeout=15, env=env)
        self.assertNotEqual(p.returncode, 0)
        self.assertIn("remove_provider_keys_for_offline_smoke", p.stderr)

if __name__ == "__main__":
    unittest.main()
