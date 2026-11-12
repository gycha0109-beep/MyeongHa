"""Build a GEPA optimize_anything call from synthetic-only, approved-shaped inputs.

This module does not execute the call; a separate sandbox/gateway admission is required.
"""
import hashlib
import pathlib
import re
import stat
from runner import preflight, PreflightDenied, CHARACTER_IDS

# Offline GEPA feedback must not smuggle arbitrary evaluator strings to reflection/logs.
KNOWN_FAILURE_CODES = frozenset({
    'fabricated_memory', 'cross_character_or_user_leak',
    'canon_or_authority_violation', 'unsupported_relationship',
    'provider_or_cost_violation', 'synthetic_verbosity',
})
EXPRESSION_OVERRIDE = re.compile(
    r'(?:ignore|override|disregard|bypass)\s+(?:all\s+)?'
    r'(?:previous|system|developer|authority|canon|rules|instructions)'
    r'|(?:기존|상위|시스템|개발자|권한|캐논|설정|기억|관계).{0,16}'
    r'(?:무시|덮어써|변경|조작|우회|해제)', re.I,
)


def _safe_expression(text):
    return (isinstance(text, str) and bool(text.strip()) and len(text) <= 1600
            and re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', text) is None
            and EXPRESSION_OVERRIDE.search(text) is None)



def build_offline_gepa_kwargs(envelope, *, seed_text, evaluator, reflection_lm,
                              output_dir, repository_root, config_factory, max_evals=4):
    """Inject actual GEPA OptimizeAnythingConfig only after version pin/contract probe.

    `reflection_lm` is required to prevent GEPA's implicit paid-provider default.
    Returning call arguments (not invoking GEPA) is safe for no-network preflight.
    """
    preflight(envelope)
    if not _safe_expression(seed_text):
        raise PreflightDenied('seed_text')
    if hashlib.sha256(seed_text.encode('utf-8')).hexdigest()!=envelope['candidateSha256']:
        raise PreflightDenied('seed_hash')
    if not callable(evaluator) or not callable(reflection_lm) or not callable(config_factory):
        raise PreflightDenied('explicit_evaluator_reflection_config_required')
    if not isinstance(max_evals,int) or isinstance(max_evals,bool) or max_evals<1 or max_evals>10:
        raise PreflightDenied('max_evals_offline_only')
    root=pathlib.Path(repository_root).resolve(strict=True)
    requested_out=pathlib.Path(output_dir)
    if requested_out.is_symlink():
        raise PreflightDenied('private_output_required')
    out=requested_out.resolve(strict=True)
    if out == root or out.is_relative_to(root) or not out.is_dir():
        raise PreflightDenied('private_output_required')
    if stat.S_IMODE(out.stat().st_mode)&0o077:
        raise PreflightDenied('private_output_permissions')
    example_fields = ('id', 'characterId', 'familyId', 'split', 'contentSha256')
    admissible_examples = frozenset(
        tuple(row[key] for key in example_fields) for row in envelope['dataset']
    )

    def bounded_eval(candidate, example):
        if not isinstance(candidate, dict) or set(candidate) != {envelope['mutableSlot']}:
            raise PreflightDenied('candidate_mutated_other_slots')
        if not _safe_expression(candidate[envelope['mutableSlot']]):
            raise PreflightDenied('untrusted_generated_candidate')
        if not isinstance(example, dict) or set(example) != set(example_fields):
            raise PreflightDenied('example_fields')
        if example['split'] not in {'development', 'optimizer_validation'}:
            raise PreflightDenied('sealed_example')
        if (tuple(example[key] for key in example_fields) not in admissible_examples
                or example['characterId'] not in CHARACTER_IDS):
            raise PreflightDenied('unregistered_example')
        try:
            output = evaluator(candidate, example)
        except Exception:
            # Never relay an evaluator exception containing private source text.
            raise PreflightDenied('evaluator_failed') from None
        if not isinstance(output, tuple) or len(output) != 2:
            raise PreflightDenied('feedback_shape')
        score, feedback = output
        if not isinstance(score, (int, float)) or isinstance(score, bool) or not 0 <= score <= 1:
            raise PreflightDenied('score_range')
        if not isinstance(feedback, dict) or set(feedback) != {
                'failure_codes', 'character_id', 'raw_dialogue_excluded'}:
            raise PreflightDenied('feedback_fields')
        failure_codes = feedback['failure_codes']
        if (feedback['raw_dialogue_excluded'] is not True
                or feedback['character_id'] != example['characterId']
                or not isinstance(failure_codes, list)
                or any(type(code) is not str or code not in KNOWN_FAILURE_CODES
                       for code in failure_codes)
                or len(set(failure_codes)) != len(failure_codes)):
            raise PreflightDenied('unsafe_feedback')
        return float(score), {
            'failure_codes': list(failure_codes),
            'character_id': example['characterId'],
            'raw_dialogue_excluded': True,
        }
    data=[dict(x) for x in envelope['dataset'] if x['split']=='development']
    validation=[dict(x) for x in envelope['dataset'] if x['split']=='optimizer_validation']
    if not data or not validation:
        raise PreflightDenied('both_development_and_validation_required')
    cfg=config_factory(engine='gepa',name='myeongha-offline-contract',max_evals=max_evals,max_concurrency=1,
        max_token_cost=0, output_dir=str(out),run_dir=str(out),
        engine_config={'reflection':{'reflection_lm':reflection_lm}})
    return {'seed_candidate':{envelope['mutableSlot']:seed_text},
        'dataset':data,'valset':validation,'test_set':None,
        'evaluator':bounded_eval,
        'objective':'Improve synthetic character expression without changing identity or authority.',
        'background':'Only synthetic public metadata. No private conversation, canon mutation, or paid providers.',
        'config':cfg}