"""Pinned upstream GEPA smoke: synthetic data, in-process reflection, no network.

Run ONLY with a pinned GEPA source installation. Never uses any OpenRouter
client, credentials, private chats, the sealed holdout, or a live LM.
"""
from __future__ import annotations

import hashlib
import importlib
import pathlib
import socket
import tempfile
import unittest
from unittest.mock import patch

from gepa_api_contract import build_offline_gepa_kwargs
from gepa_result_proposal import freeze_offline_gepa_result
from runner import probe_installed_gepa

SEED = "Respond clearly in natural Korean."
SHA = "a" * 64


def fixture():
    return {
        "schemaVersion": "character-gepa-offline-bridge-v1",
        "optimizer": "gepa",
        "runManifestSha256": SHA,
        "candidateSha256": hashlib.sha256(SEED.encode()).hexdigest(),
        "mutableSlot": "character_expression",
        "dataset": [
            {"id": "public-syn-dev", "characterId": "yeoul", "familyId": "public-dev", "split": "development", "contentSha256": SHA},
            {"id": "public-syn-val", "characterId": "yeoul", "familyId": "public-val", "split": "optimizer_validation", "contentSha256": "b" * 64},
        ],
        "test_set": None,
        "externalCallsAuthorized": False,
        "productionEligible": False,
        "requiresPrivateRuntime": False,
        "qualityGainEstablished": False,
    }


class NoNetworkReflector:
    """Uses the GEPA ReflectionLM protocol without calling a language model."""

    def __init__(self, proposal_class):
        self.proposal_class = proposal_class
        self.calls = 0

    def reflect(self, candidate, reflective_dataset, components_to_update):
        self.calls += 1
        proposed = {key: "Respond clearly in natural Korean. Use concise answers." for key in components_to_update}
        return self.proposal_class(new_texts=proposed), self


class PinnedGepaOfflineTest(unittest.TestCase):
    def test_real_pinned_gepa_runs_shared_slot_for_two_characters(self):
        """One offline GEPA run must evaluate both characters, not just a mean-only mock."""
        probe = probe_installed_gepa()
        self.assertTrue(probe["api_compatible"], probe)
        module = importlib.import_module("gepa.optimize_anything")
        reflector_module = importlib.import_module(
            "gepa.proposer.reflective_mutation.reflection_lm")
        strategy = NoNetworkReflector(reflector_module.ReflectionProposal)
        shared_seed = "Respond clearly in natural Korean."
        samples = [
            {"id": "shared-yeoul-dev", "characterId": "yeoul",
             "familyId": "shared-yeoul-family-dev", "split": "development",
             "contentSha256": "a" * 64},
            {"id": "shared-seyeon-dev", "characterId": "seyeon",
             "familyId": "shared-seyeon-family-dev", "split": "development",
             "contentSha256": "b" * 64},
            {"id": "shared-yeoul-val", "characterId": "yeoul",
             "familyId": "shared-yeoul-family-val", "split": "optimizer_validation",
             "contentSha256": "c" * 64},
            {"id": "shared-seyeon-val", "characterId": "seyeon",
             "familyId": "shared-seyeon-family-val", "split": "optimizer_validation",
             "contentSha256": "d" * 64},
        ]
        plan = {**fixture(), "mutableSlot": "shared_expression",
                "candidateSha256": hashlib.sha256(shared_seed.encode()).hexdigest(),
                "dataset": samples}
        seen = set()

        def judge(candidate, example):
            # Synthetic per-character baselines differ; neither is a real quality score.
            character = example["characterId"]
            seen.add((character, example["split"]))
            concise = "concise answers" in candidate["shared_expression"]
            baseline = {"yeoul": 0.2, "seyeon": 0.35}[character]
            improved = {"yeoul": 0.8, "seyeon": 0.75}[character]
            return (improved if concise else baseline,
                    {"failure_codes": [], "character_id": character,
                     "raw_dialogue_excluded": True})

        def forbid_remote(*args, **kwargs):
            raise AssertionError("GEPA shared test attempted an external model call")

        def config_factory(**kwargs):
            kwargs["max_token_cost"] = None
            kwargs["engine_config"]["reflection"]["reflection_strategy"] = strategy
            kwargs["engine_config"].update({
                "merge": None, "refiner": None,
                "tracking": {"use_wandb": False, "use_mlflow": False},
            })
            return module.OptimizeAnythingConfig(**kwargs)

        with tempfile.TemporaryDirectory(prefix="myeongha-shared-gepa-out-") as out, \
                tempfile.TemporaryDirectory(prefix="myeongha-shared-gepa-repo-") as repo:
            kwargs = build_offline_gepa_kwargs(
                plan, seed_text=shared_seed, evaluator=judge,
                reflection_lm=forbid_remote, output_dir=out,
                repository_root=repo, config_factory=config_factory,
                max_evals=10)
            self.assertEqual(kwargs["test_set"], None)
            self.assertEqual({e["characterId"] for e in kwargs["dataset"]},
                             {"yeoul", "seyeon"})
            self.assertEqual({e["characterId"] for e in kwargs["valset"]},
                             {"yeoul", "seyeon"})
            self.assertEqual(set(kwargs["seed_candidate"]), {"shared_expression"})
            with patch.object(socket.socket, "connect", side_effect=forbid_remote), \
                    patch.object(socket.socket, "connect_ex", side_effect=forbid_remote), \
                    patch("socket.create_connection", side_effect=forbid_remote):
                result = module.optimize_anything(**kwargs)

        self.assertGreater(strategy.calls, 0)
        self.assertEqual({character for character, _ in seen}, {"yeoul", "seyeon"})
        self.assertIn("shared_expression", result.best_candidate)
        self.assertIn("concise answers", result.best_candidate["shared_expression"])
        self.assertGreater(result.best_score, 0.35)
        frozen = freeze_offline_gepa_result(
            result, plan, immutable_sources_sha256=SHA, max_evals=10)
        self.assertEqual(frozen["proposal"]["slot"], "shared_expression")
        self.assertEqual(
            frozen["proposal"]["text"], result.best_candidate["shared_expression"])
        self.assertEqual(frozen["researchEvidence"]["sourceAuthenticated"], False)
        self.assertEqual(frozen["researchEvidence"]["ownerReviewGranted"], False)
        self.assertEqual(frozen["externalCalls"], 0)
        self.assertLessEqual(result.total_evals, 10)
        # This is only a synthetic shared run. Neither run nor result may
        # authorize character-level quality claims, owner review or release.

    def test_real_api_signature_and_in_process_proposal(self):
        probe = probe_installed_gepa()
        self.assertTrue(probe["api_compatible"], probe)
        module = importlib.import_module("gepa.optimize_anything")
        refl = importlib.import_module("gepa.proposer.reflective_mutation.reflection_lm")
        self.assertTrue(hasattr(module, "OptimizeAnythingConfig"))
        strategy = NoNetworkReflector(refl.ReflectionProposal)
        calls = []

        def judge(candidate, example):
            # Quality numbers below are synthetic fixtures, never a product gain.
            calls.append(example["id"])
            score = 0.8 if "concise answers" in candidate["character_expression"] else 0.2
            return score, {"failure_codes": [] if score > 0.5 else ["synthetic_verbosity"],
                           "character_id": example["characterId"], "raw_dialogue_excluded": True}

        def forbid_reflection_lm(*_, **__):
            raise AssertionError("unexpected fallback to model-based reflection")

        def factory(**kwargs):
            # The real GEPA engine sees an explicit in-process reflection strategy.
            kwargs["max_token_cost"] = None  # No remote LM exists; external network is blocked below.
            kwargs["engine_config"]["reflection"]["reflection_strategy"] = strategy
            kwargs["engine_config"].update({"merge": None, "refiner": None, "tracking": {"use_wandb": False, "use_mlflow": False}})
            return module.OptimizeAnythingConfig(**kwargs)

        def network_forbidden(*_args, **_kwargs):
            raise AssertionError("network connection forbidden in synthetic GEPA smoke")

        with tempfile.TemporaryDirectory(prefix="myeongha-gepa-out-") as output_dir, \
                tempfile.TemporaryDirectory(prefix="myeongha-gepa-repo-") as repo_dir:
            kwargs = build_offline_gepa_kwargs(
                fixture(), seed_text=SEED, evaluator=judge, reflection_lm=forbid_reflection_lm,
                output_dir=output_dir, repository_root=repo_dir, config_factory=factory,
                max_evals=10,
            )
            self.assertIsNone(kwargs["test_set"])
            self.assertEqual(len(kwargs["dataset"]), 1)
            self.assertEqual(len(kwargs["valset"]), 1)
            with patch.object(socket.socket, "connect", side_effect=network_forbidden), \
                    patch.object(socket.socket, "connect_ex", side_effect=network_forbidden), \
                    patch("socket.create_connection", side_effect=network_forbidden):
                result = module.optimize_anything(**kwargs)

            self.assertGreater(len(calls), 0, "real GEPA must call the injected evaluator")
            self.assertGreater(strategy.calls, 0, "real GEPA must use the injected offline reflection strategy")
            self.assertIn("character_expression", result.best_candidate)
            self.assertIn("concise answers", result.best_candidate["character_expression"])
            self.assertGreater(result.best_score, 0.2)
            frozen = freeze_offline_gepa_result(
                result, fixture(), immutable_sources_sha256=SHA, max_evals=10)
            self.assertEqual(frozen["proposal"]["slot"], "character_expression")
            self.assertEqual(frozen["proposal"]["text"],
                             result.best_candidate["character_expression"])
            self.assertFalse(frozen["researchEvidence"]["heldoutPassed"])
            self.assertFalse(frozen["productionEligible"])
            self.assertLessEqual(result.total_evals, 10)
            self.assertEqual(fixture()["test_set"], None)
            self.assertTrue(pathlib.Path(output_dir).is_dir())


if __name__ == "__main__":
    unittest.main()