"""Build a GEPA optimize_anything call from synthetic-only, approved-shaped inputs.

This module does not execute the call; a separate sandbox/gateway admission is required.
"""
import hashlib
import pathlib
import re
import stat
from runner import preflight, PreflightDenied


def build_offline_gepa_kwargs(envelope, *, seed_text, evaluator, reflection_lm,
                              output_dir, repository_root, config_factory, max_evals=4):
    """Inject actual GEPA OptimizeAnythingConfig only after version pin/contract probe.

    `reflection_lm` is required to prevent GEPA's implicit paid-provider default.
    Returning call arguments (not invoking GEPA) is safe for no-network preflight.
    """
    report=preflight(envelope)
    if not isinstance(seed_text,str) or len(seed_text)<1 or len(seed_text)>1600:
        raise PreflightDenied('seed_text')
    if hashlib.sha256(seed_text.encode('utf-8')).hexdigest()!=envelope['candidateSha256']:
        raise PreflightDenied('seed_hash')
    if re.search(r'(?:ignore|override)\s+(?:previous|system|authority)|(?:상위|설정|기억|관계).{0,16}(?:무시|변경|우회)',seed_text,re.I):
        raise PreflightDenied('candidate_override')
    if not callable(evaluator) or not callable(reflection_lm) or not callable(config_factory):
        raise PreflightDenied('explicit_evaluator_reflection_config_required')
    if not isinstance(max_evals,int) or isinstance(max_evals,bool) or max_evals<1 or max_evals>10:
        raise PreflightDenied('max_evals_offline_only')
    root=pathlib.Path(repository_root).resolve(strict=True)
    out=pathlib.Path(output_dir).resolve(strict=True)
    if out == root or out.is_relative_to(root) or not out.is_dir() or out.is_symlink():
        raise PreflightDenied('private_output_required')
    if stat.S_IMODE(out.stat().st_mode)&0o077:
        raise PreflightDenied('private_output_permissions')
    def bounded_eval(candidate,example):
        if not isinstance(candidate,dict) or set(candidate)!={envelope['mutableSlot']}:
            raise PreflightDenied('candidate_mutated_other_slots')
        if not isinstance(example,dict) or set(example)!={'id','characterId','familyId','split','contentSha256'}:
            raise PreflightDenied('example_fields')
        if example['split'] not in {'development','optimizer_validation'}:
            raise PreflightDenied('sealed_example')
        output=evaluator(candidate,example)
        if not isinstance(output,tuple) or len(output)!=2:
            raise PreflightDenied('feedback_shape')
        score,feedback=output
        if not isinstance(score,(int,float)) or isinstance(score,bool) or not 0<=score<=1:
            raise PreflightDenied('score_range')
        if not isinstance(feedback,dict) or set(feedback)!={'failure_codes','character_id','raw_dialogue_excluded'}:
            raise PreflightDenied('feedback_fields')
        if feedback['raw_dialogue_excluded'] is not True or not isinstance(feedback['failure_codes'],list) or any(not isinstance(x,str) or not re.fullmatch('[a-z_]{1,40}',x) for x in feedback['failure_codes']):
            raise PreflightDenied('unsafe_feedback')
        return (float(score),feedback)
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
        'config':cfg,
        '_contract_status':report['status']}