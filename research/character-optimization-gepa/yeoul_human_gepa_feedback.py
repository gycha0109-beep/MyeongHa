"""Offline Yeoul v5/v6 human-rating collection and GEPA-feedback preparation.

No remote calls; unreviewed responses never become synthetic human labels.
"""
import argparse
import hashlib
import html
import json
from pathlib import Path
from yeoul_dspy_actual_corpus import EXPECTED_IDS, load_pairs

SCORE_KEYS = ("natural_korean_v5", "natural_korean_v6",
              "yeoul_character_v5", "yeoul_character_v6")
FAILURE_CODES = ("unsupported_relationship", "invented_memory_or_canon",
                 "unsafe_advice", "unsupported_saju_claim", "dismissed_hurt")


def validate_review(review, source, require_complete=False):
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if not isinstance(review, dict) or review.get("source_sha256") != digest:
        raise ValueError("source_hash_mismatch")
    rows = review.get("cases")
    if not isinstance(rows, list) or len(rows) != 9:
        raise ValueError("review_case_count")
    if {r.get("id") for r in rows if isinstance(r, dict)} != set(EXPECTED_IDS):
        raise ValueError("review_case_ids")
    if review.get("status") not in ("UNREVIEWED", "PARTIAL", "HUMAN_REVIEWED"):
        raise ValueError("review_status")
    valid = {}
    source_rows = {p["id"]: p for p in load_pairs(source)}
    for row in rows:
        cid = row["id"]
        if cid in valid:
            raise ValueError("duplicate_case")
        if set(row) - {"id", "preferred", "reason", *SCORE_KEYS, "hard_failures_v5", "hard_failures_v6"}:
            raise ValueError("unknown_review_field")
        if any(k not in row for k in ("preferred", "reason", *SCORE_KEYS)):
            raise ValueError("missing_review_field")
        for k in SCORE_KEYS:
            n = row[k]
            if n is not None and (type(n) is not int or not 0 <= n <= 4):
                raise ValueError("rating_range")
        if row["preferred"] not in ("v5", "v6", "tie", None):
            raise ValueError("preference_choice")
        if not isinstance(row["reason"], str) or len(row["reason"]) > 1000:
            raise ValueError("reason_invalid")
        for v in ("v5", "v6"):
            failures = row.get("hard_failures_" + v, [])
            if not isinstance(failures, list) or len(failures) != len(set(failures)):
                raise ValueError("failure_shape")
            if any(f not in FAILURE_CODES for f in failures):
                raise ValueError("failure_code")
        complete = row["preferred"] is not None and all(row[k] is not None for k in SCORE_KEYS)
        if require_complete and not complete:
            raise ValueError("incomplete_human_rating")
        valid[cid] = dict(row, complete=complete, source=source_rows[cid])
    if require_complete and review["status"] != "HUMAN_REVIEWED":
        raise ValueError("human_review_status_required")
    return valid


def feedback(review, source):
    items = validate_review(review, source)
    completed = sum(x["complete"] for x in items.values())
    scores = []
    for cid in EXPECTED_IDS:
        item = items[cid]
        if not item["complete"]:
            continue
        entry = {"case_id": cid}
        for version in ("v5", "v6"):
            natural = item["natural_korean_" + version]
            character = item["yeoul_character_" + version]
            failures = item.get("hard_failures_" + version, [])
            preference = item["preferred"]
            bonus = 0.1 if preference == version else 0.05 if preference == "tie" else 0
            score = 0 if failures else round(0.45 * natural / 4 + 0.45 * character / 4 + bonus, 5)
            entry[version] = {
                "score": score,
                "response_sha256": hashlib.sha256(item["source"][version].encode()).hexdigest(),
                "feedback": {
                    "natural_rating": natural, "character_rating": character,
                    "preferred": preference, "failure_codes": list(failures),
                    "raw_dialogue_excluded": True,
                    "human_reviewed": True
                }
            }
        scores.append(entry)
    return {
        "status": "HUMAN_REVIEW_COMPLETE" if completed == 9 and review["status"] == "HUMAN_REVIEWED" else "HUMAN_REVIEW_INCOMPLETE",
        "reviewed_cases": completed, "total_cases": 9,
        "can_use_as_gepa_development_feedback": completed == 9 and review["status"] == "HUMAN_REVIEWED",
        "independent_holdout": False, "actual_provider_calls": 0,
        "scores": scores
    }


def render_html(source, output):
    pairs = load_pairs(source)
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    page = [
        '<!doctype html><html lang="ko"><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        '<title>여울 v5·v6 사람 평가</title>',
        '<style>body{font:15px/1.6 system-ui;max-width:1060px;margin:auto;padding:24px;background:#f2f4f9;color:#1b2639}',
        'section{background:white;padding:20px;margin:15px 0;border-radius:12px;border:1px solid #d8deea}',
        '.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}.reply{white-space:pre-wrap;min-height:90px}',
        'label{display:inline-block;margin:8px}select,textarea{font:inherit;padding:7px;border:1px solid #ccd3df;border-radius:6px}',
        'textarea{width:90%;min-height:50px}button{background:#28417d;color:white;border:0;padding:12px 20px;border-radius:8px}',
        '@media(max-width:700px){.pair{grid-template-columns:1fr}}</style>',
        '<h1>여울 대사 실측 평가 · v5 vs v6</h1>',
        '<p>9개 상황 / 18개 실제 GPT-6 Luna 응답. 한국어 자연성(N)과 여울 고유성(Y)을 0~4점으로 별도 평가합니다.',
        '평가는 브라우저 안에서만 진행하며 결과 JSON을 직접 내려받습니다.</p>',
        '<p id="progress">완료 0 / 9</p><main>'
    ]
    for n,p in enumerate(pairs,1):
        cid = html.escape(p["id"])
        page += ['<section data-case="'+cid+'"><h2>'+str(n)+'. '+cid+'</h2>',
                 '<p><b>상황:</b> '+html.escape(p["message"])+'</p>',
                 '<p>관계: '+html.escape(p["relationship"])+' / 확인된 사건: '+str(p["verifiedEventCount"])+'</p>',
                 '<div class="pair">']
        for v in ("v5","v6"):
            page += ['<div><h3>'+v.upper()+'</h3><p class="reply">'+html.escape(p[v])+'</p>']
            for metric,label in (("natural_korean","한국어 자연성"),("yeoul_character","여울 고유성")):
                field = metric+"_"+v
                page += ['<label>'+label+' <select data-field="'+field+'"><option value="">미평가</option>',
                         ''.join('<option>'+str(i)+'</option>' for i in range(5)),'</select></label>']
            page += ['<details><summary>하드 실패</summary>']
            for code in FAILURE_CODES:
                page += ['<label><input type="checkbox" data-failure="'+v+'" value="'+code+'">'+code+'</label>']
            page += ['</details></div>']
        page += ['</div><hr><label>더 나은 문체 <select data-field="preferred">',
                 '<option value="">미평가</option><option value="v5">v5</option><option value="v6">v6</option><option value="tie">동률</option>',
                 '</select></label><p><label>평가 이유<br><textarea data-field="reason"></textarea></label></p></section>']
    page += [
        '</main><button id="save">평가 결과 JSON 저장</button>',
        '<script>',
        'const hash='+json.dumps(source_hash)+';',
        'const fields='+json.dumps(SCORE_KEYS)+';',
        'const sections=[...document.querySelectorAll("section[data-case]")];',
        'function collect(){const cases=sections.map(section=>{',
        'const row={id:section.dataset.case,preferred:null,reason:"",hard_failures_v5:[],hard_failures_v6:[]};',
        'for(const field of fields){const el=section.querySelector("[data-field="+field+"]");row[field]=el.value===""?null:Number(el.value);}',
        'const pref=section.querySelector("[data-field=preferred]").value;row.preferred=pref||null;',
        'row.reason=section.querySelector("[data-field=reason]").value;',
        'for(const v of ["v5","v6"]){row["hard_failures_"+v]=[...section.querySelectorAll("[data-failure="+v+"]:checked")].map(e=>e.value);}',
        'return row;});',
        'const count=cases.filter(c=>c.preferred!==null && fields.every(k=>c[k]!==null)).length;',
        'return {source_sha256:hash,status:count===9?"HUMAN_REVIEWED":count===0?"UNREVIEWED":"PARTIAL",cases,count};}',
        'document.querySelector("main").addEventListener("change",()=>{document.querySelector("#progress").textContent="완료 "+collect().count+" / 9";});',
        'document.querySelector("#save").addEventListener("click",()=>{const data=collect();delete data.count;',
        'const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json;charset=utf-8"});',
        'const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="yeoul-human-review.json";a.click();',
        'setTimeout(()=>URL.revokeObjectURL(a.href),2000);});',
        '</script></html>'
    ]
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text("\n".join(page),encoding="utf-8")


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--input",required=True,type=Path)
    p.add_argument("--html",type=Path)
    p.add_argument("--review",type=Path)
    p.add_argument("--feedback",type=Path)
    args=p.parse_args()
    if args.html:
        render_html(args.input,args.html)
        print(json.dumps({"html":str(args.html),"responses":18,"human_ratings":0},ensure_ascii=False))
        return
    if not args.review:
        p.error("--review or --html required")
    review=json.loads(args.review.read_text(encoding="utf-8-sig"))
    result=feedback(review,args.input)
    if args.feedback:
        args.feedback.parent.mkdir(parents=True,exist_ok=True)
        args.feedback.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps({k:v for k,v in result.items() if k!="scores"},ensure_ascii=False))


if __name__=="__main__":
    main()
