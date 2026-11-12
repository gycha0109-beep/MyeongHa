"""GEPA new-API contract probe. This module never invokes GEPA or a provider."""
import argparse
import importlib
import inspect
import json
import pathlib
import re
import sys

SHA = re.compile(r'^[a-f0-9]{64}$')
ALLOWED = {'schemaVersion','optimizer','runManifestSha256','candidateSha256','mutableSlot','dataset',
           'test_set','externalCallsAuthorized','productionEligible','requiresPrivateRuntime','qualityGainEstablished'}
ROW_KEYS = {'id','characterId','familyId','split','contentSha256'}
CHARACTER_IDS = frozenset({
    'seyeon','yeoul','seorin','rahyeon','mira',
    'taegyeom','yunho','doyun','baekheon',
})
META_KEY = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}


class PreflightDenied(ValueError):
    pass


def preflight(envelope):
    if not isinstance(envelope,dict) or set(envelope)!=ALLOWED:
        raise PreflightDenied('envelope_key_contract')
    if envelope['schemaVersion']!='character-gepa-offline-bridge-v1' or envelope['optimizer']!='gepa':
        raise PreflightDenied('envelope_version')
    if envelope['mutableSlot'] not in {'shared_expression','character_expression'}:
        raise PreflightDenied('mutable_slot')
    if not all(isinstance(envelope[k],str) and SHA.fullmatch(envelope[k]) for k in ('runManifestSha256','candidateSha256')):
        raise PreflightDenied('manifest_hash')
    if envelope['test_set'] is not None or envelope['externalCallsAuthorized'] is not False or envelope['productionEligible'] is not False or envelope['requiresPrivateRuntime'] is not False or envelope['qualityGainEstablished'] is not False:
        raise PreflightDenied('no_live_or_sealed_data')
    rows=envelope['dataset']
    if not isinstance(rows,list) or not 2 <= len(rows) <= 500:
        raise PreflightDenied('dataset_shape')
    ids=set()
    families={}
    contents={}
    covered={}
    for row in rows:
        if (not isinstance(row,dict) or set(row)!=ROW_KEYS
                or not isinstance(row['split'],str)
                or row['split'] not in {'development','optimizer_validation'}
                or not isinstance(row['contentSha256'],str)
                or not SHA.fullmatch(row['contentSha256'])
                or not isinstance(row['characterId'],str)
                or row['characterId'] not in CHARACTER_IDS
                or any(not isinstance(row[k],str) or not META_KEY.fullmatch(row[k])
                       for k in ('id','familyId'))):
            raise PreflightDenied('dataset_row')
        identity=(row['characterId'],row['id'])
        if identity in ids:
            raise PreflightDenied('duplicate_corpus_id')
        ids.add(identity)
        family=(row['characterId'],row['familyId'])
        if family in families and families[family]!=row['split']:
            raise PreflightDenied('family_crosses_split')
        families[family]=row['split']
        if row['contentSha256'] in contents and contents[row['contentSha256']]!=row['split']:
            raise PreflightDenied('identical_content_crosses_split')
        contents[row['contentSha256']]=row['split']
        covered.setdefault(row['characterId'],set()).add(row['split'])
    if any(splits != {'development','optimizer_validation'} for splits in covered.values()):
        raise PreflightDenied('missing_character_split')
    return {'status':'offline_preflight_pass','optimizer':'gepa', 'cases':len(rows),
            'external_calls':0,'candidate_executed':False,'optimization_executed':False,
            'cost_usd':0,'quality_gain_established':False}


def probe_installed_gepa():
    """Inspect a real installation if present; never call optimize_anything()."""
    try:
        api=importlib.import_module('gepa.optimize_anything')
    except ImportError:
        return {'status':'gepa_not_installed','api_compatible':False}
    optimizer=getattr(api,'optimize_anything',None)
    config=getattr(api,'OptimizeAnythingConfig',None)
    if not callable(optimizer) or config is None:
        return {'status':'unsupported_api','api_compatible':False}
    names=set(inspect.signature(optimizer).parameters)
    needed={'seed_candidate','evaluator','dataset','valset','test_set','config'}
    if not needed.issubset(names) or 'engine' not in inspect.signature(config).parameters:
        return {'status':'signature_mismatch','api_compatible':False}
    return {'status':'signature_compatible_unexecuted','api_compatible':True,
            'runtime_behavior_verified':False}


def main(argv=None):
    parser=argparse.ArgumentParser()
    parser.add_argument('--plan',type=pathlib.Path,required=True)
    parser.add_argument('--probe-gepa',action='store_true')
    args=parser.parse_args(argv)
    p=args.plan.resolve(strict=True)
    report=preflight(json.loads(p.read_text(encoding='utf-8')))
    if args.probe_gepa:
        report['gepa_contract_probe']=probe_installed_gepa()
    print(json.dumps(report,ensure_ascii=False,sort_keys=True))


if __name__=='__main__':
    try:
        main()
    except (PreflightDenied,ValueError,FileNotFoundError) as e:
        print(json.dumps({'status':'blocked','reason':str(e)}),file=sys.stderr)
        sys.exit(2))


class PreflightDenied(ValueError):
    pass


def preflight(envelope):
    if not isinstance(envelope,dict) or set(envelope)!=ALLOWED:
        raise PreflightDenied('envelope_key_contract')
    if envelope['schemaVersion']!='character-gepa-offline-bridge-v1' or envelope['optimizer']!='gepa':
        raise PreflightDenied('envelope_version')
    if envelope['mutableSlot'] not in {'shared_expression','character_expression'}:
        raise PreflightDenied('mutable_slot')
    if not all(isinstance(envelope[k],str) and SHA.fullmatch(envelope[k]) for k in ('runManifestSha256','candidateSha256')):
        raise PreflightDenied('manifest_hash')
    if envelope['test_set'] is not None or envelope['externalCallsAuthorized'] is not False or envelope['productionEligible'] is not False or envelope['requiresPrivateRuntime'] is not False or envelope['qualityGainEstablished'] is not False:
        raise PreflightDenied('no_live_or_sealed_data')
    rows=envelope['dataset']
    if not isinstance(rows,list) or not rows or len(rows)>500:
        raise PreflightDenied('dataset_shape')
    for row in rows:
        if not isinstance(row,dict) or set(row)!=ROW_KEYS or row['split'] not in {'development','optimizer_validation'} or not SHA.fullmatch(str(row['contentSha256'])) or any(not isinstance(row[k],str) or not row[k] for k in ('id','familyId','characterId')):
            raise PreflightDenied('dataset_row')
    return {'status':'offline_preflight_pass','optimizer':'gepa', 'cases':len(rows),
            'external_calls':0,'candidate_executed':False,'optimization_executed':False,
            'cost_usd':0,'quality_gain_established':False}


def probe_installed_gepa():
    """Inspect a real installation if present; never call optimize_anything()."""
    try:
        api=importlib.import_module('gepa.optimize_anything')
    except ImportError:
        return {'status':'gepa_not_installed','api_compatible':False}
    optimizer=getattr(api,'optimize_anything',None)
    config=getattr(api,'OptimizeAnythingConfig',None)
    if not callable(optimizer) or config is None:
        return {'status':'unsupported_api','api_compatible':False}
    names=set(inspect.signature(optimizer).parameters)
    needed={'seed_candidate','evaluator','dataset','valset','test_set','config'}
    if not needed.issubset(names) or 'engine' not in inspect.signature(config).parameters:
        return {'status':'signature_mismatch','api_compatible':False}
    return {'status':'signature_compatible_unexecuted','api_compatible':True,
            'runtime_behavior_verified':False}


def main(argv=None):
    parser=argparse.ArgumentParser()
    parser.add_argument('--plan',type=pathlib.Path,required=True)
    parser.add_argument('--probe-gepa',action='store_true')
    args=parser.parse_args(argv)
    p=args.plan.resolve(strict=True)
    report=preflight(json.loads(p.read_text(encoding='utf-8')))
    if args.probe_gepa:
        report['gepa_contract_probe']=probe_installed_gepa()
    print(json.dumps(report,ensure_ascii=False,sort_keys=True))


if __name__=='__main__':
    try:
        main()
    except (PreflightDenied,ValueError,FileNotFoundError) as e:
        print(json.dumps({'status':'blocked','reason':str(e)}),file=sys.stderr)
        sys.exit(2)