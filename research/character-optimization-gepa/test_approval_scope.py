"""Scope matches do not grant paid authorization. Synthetic fixtures only."""
import pathlib
import tempfile
import unittest
from approval_scope import (
    ApprovalHold, inspect_approval_scope, require_authenticated_paid_approval
)
from governed_dry_run import GovernedDryRunGate, GovernedBudgetLedger
from test_governed_dry_run import policy, req, receipt


def claim(p, *, manifest_sha256='sha256:immutable-synthetic-manifest', **overrides):
    record = dict(schema_version='research-budget-approval-scope-v1',
        decision_id='local-example-not-real-approval', decision_kind='gepa_paid_experiment',
        decision_status='approved', run_id=p.run_id, target_id=p.target_id,
        manifest_sha256=manifest_sha256, policy_hash=p.policy_hash,
        model_id=p.model_id, provider_id=p.provider,
        roles=['student'], data_scopes=['synthetic_development'],
        max_total_micro_usd=5000, max_attempts=6, valid_from_epoch=1,
        expires_epoch=4102444800, authority_ref='test-fixture-non-authoritative')
    record.update(overrides)
    return record


class ApprovalScopeTests(unittest.TestCase):
    def inspect(self, p=None, record=None, **changes):
        p = p or policy()
        return inspect_approval_scope(
            host_record=record if record is not None else claim(p),
            policy=p, request=req(p, **changes),
            run_manifest_sha256='sha256:immutable-synthetic-manifest',
            now_epoch=100, run_budget_micro_usd=3000,
            run_attempt_cap=4, requested_data_scope='synthetic_development'
        )

    def test_offline_scope_match_does_not_authorize_transport(self):
        outcome = self.inspect()
        self.assertTrue(outcome.scope_matches)
        self.assertFalse(outcome.issuer_authenticated)
        self.assertFalse(outcome.paid_transport_authorized)

    def test_client_approval_field_and_missing_records_fail(self):
        with self.assertRaises(ApprovalHold):
            self.inspect(approvalRef='approval-by-client')
        with self.assertRaises(ApprovalHold):
            self.inspect(record={'approvalRef':'fake'})
        for cb in (None, lambda _: claim(policy())):
            with self.assertRaisesRegex(ApprovalHold, 'not_configured'):
                require_authenticated_paid_approval(
                    claim_ref='local-example-not-real-approval',
                    trusted_decision_reader=cb)

    def test_scope_rejects_wrong_model_provider_target_and_policy_hash(self):
        p = policy()
        for name,value in [
            ('run_id','other-run'), ('target_id','seyeon'),
            ('model_id','other-model'), ('provider_id','other-provider'),
            ('policy_hash','sha256:tampered'), ('manifest_sha256','sha256:other'),
            ('decision_kind','candidate_review'), ('decision_status','pending'),
        ]:
            with self.subTest(name=name), self.assertRaises(ApprovalHold):
                self.inspect(p, claim(p, **{name:value}))

    def test_scope_rejects_expiry_roles_data_cost_and_call_limits(self):
        p=policy()
        cases=[
            {'expires_epoch':99}, {'valid_from_epoch':200},
            {'roles':['judge']}, {'data_scopes':['unreviewed_private_chat']},
            {'max_total_micro_usd':2000}, {'max_attempts':2},
            {'roles':[['not', 'hashable']]}, {'data_scopes':[{}]},
        ]
        for fields in cases:
            with self.subTest(fields=fields), self.assertRaises(ApprovalHold):
                self.inspect(p, claim(p, **fields))
        with self.assertRaises(ApprovalHold):
            inspect_approval_scope(host_record=claim(p),policy=p,request=req(p),
                run_manifest_sha256='sha256:immutable-synthetic-manifest',
                now_epoch=100, run_budget_micro_usd=100, run_attempt_cap=1,
                requested_data_scope='private_user_transcripts')

    def test_scopes_do_not_modify_budget_or_fake_existing_owner_approval(self):
        with tempfile.TemporaryDirectory() as d:
            p=policy()
            ledger=GovernedBudgetLedger(pathlib.Path(d)/'ledger.sqlite',
                run_id=p.run_id,max_spend_micro_usd=5000,max_attempts=6,
                role_caps={'student':4,'reflection':2,'judge':0,'holdout':0})
            gate=GovernedDryRunGate(ledger,p)
            with self.assertRaises(ApprovalHold):
                require_authenticated_paid_approval(claim_ref=None)
            self.assertEqual(ledger.status()['attempts'],0)
            dry=gate.simulate(req(p),receipt(p),now=100)
            self.assertEqual(dry['external_calls'],0)
            self.assertEqual(dry['approval_state'],'synthetic_only')


if __name__=='__main__':
    unittest.main()
