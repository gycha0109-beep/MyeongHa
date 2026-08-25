# 명하 Production P0 Decision Register — Full Audit v0.3

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.3**  
> Date: **2026-08-25**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`  
> Rule: 본 문서는 위 source authority를 구현 수준으로 구체화한다. source가 결정하지 않은 사항은 임의 확정하지 않고 `OPEN-P0` 또는 `CANDIDATE`로 표시한다.

---

## 1. 목적

미결정 production P0를 여러 문서에 중복 작성하지 않고 이 문서에서 단일 관리한다.

## 2. Decision Register

| ID | Decision | Status | Current Options / Required Resolution |
|---|---|---|---|
| `P0-SA-01` | Saju transport | **OPEN-P0** | version-pinned package vs internal HTTP/RPC service |
| `P0-CM-01` | Commerce rail | **OPEN-P0** | Web provider / Apple IAP / Google Play Billing 및 one-off/subscription/bundle matrix |
| `P0-AI-01` | AI provider/model/fallback | **OPEN-P0** | provider, model family, fallback, grounded-response validation implementation |
| `P0-AGE-01` | Minimum age / character content policy | **OPEN-P0** | 최소 이용 연령, 미성년 허용 여부, 표현 강도/제한; content bundle policy-tag slot은 미리 두되 threshold/matrix는 미확정 |
| `P0-PR-01` | Retention / backup / legal retention | **OPEN-P0** | 제품 개인정보, AI trace, 결제/회계 증적, backup retention/deletion |
| `P0-AUTH-01` | API→PostgreSQL execution identity / RLS enforcement model | **OPEN-P0** | user JWT/PostgREST delegation vs non-BYPASSRLS API role + transaction-scoped subject context; service-role-only user CRUD는 RLS baseline으로 간주하지 않음 |

## 3. 상태 규칙

```text
OPEN-P0
→ 설계는 adapter/interface/policy slot만 만든다.

DECIDED
→ 결정 근거, 결정일, 선택안, migration impact 기록.

SUPERSEDED
→ 새 decision ID를 가리킨다.
```

## 4. Decision Record Template

```yaml
id: P0-...
status: DECIDED
decided_at: YYYY-MM-DD
choice: ...
rationale: ...
affected_specs:
  - ...
migration_impact: ...
rollback_or_change_policy: ...
```

## 5. 금지

- 각 spec에서 서로 다른 임시 결론을 확정하는 것
- provider 이름을 business/domain model key로 사용하는 것
- 미결정 retention을 전제로 destructive migration을 작성하는 것
- commerce rail 결정 전 entitlement authority를 특정 store에 종속시키는 것
