import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestYeoulReviewPacket } from './yeoul-review-packet-import-v1.mjs';
import { preparePrivateYeoulForResearch } from '../character-optimization/yeoul-private-source-intake-v1.mjs';

const deepseek = 'deepseek/deepseek-v4.1-flash-1017';
const mini = 'minimax/minimax-m3.1-flash';
const ruleIds = ['ko-natural', 'history-truth', 'concrete-personality', 'conflict-boundary', 'action-before-confession', 'ko-register'];
const rules = ruleIds.map((ruleId, i) => ({ ruleId, instructionDraft: `기존 검토 규칙 ${i + 1}.`, reviewStatus: 'pending_character_owner_review' }));
const exampleQueue = {
  schemaVersion: 'yeoul-example-review-queue-v1', datasetRole: 'legacy_development_only',
  sourceExperimentRunId: 42572722295, queuedCount: 24,
  queue: Array.from({ length: 12 }, (_, i) => {
    const id = `Y${String(i + 1).padStart(2, '0')}`;
    return [1, 2].map(n => {
      const model = n === 1 ? deepseek : mini;
      const key = `${id}|baseline|${n}|${model}`;
      return { sourceKey: key, sourceQuestionId: id, model, variant: 'baseline', repeat: n,
        priority: n, userRating: 'good', sourcePrompt: `가상 질문 ${id}`, candidateReply: `가상 답변 ${id}-${n}`,
        datasetRole: 'legacy_development_only', reviewStatus: 'pending_canon_and_language_review',
        preconditions: { relationshipStage: 'no_history', historyAvailable: false, approvedFacts: [] } };
    });
  }).flat(),
};
const models = ['z-ai/glm-5.3-flash', deepseek, mini, 'qwen/qwen3.8-27b'];
const evaluationExport = {
  schemaVersion: 'yeoul-evaluation-export-v1', experimentRunId: 42572722295, scope: 'all-288',
  responses: Array.from({length:12},(_,i)=>`Y${String(i+1).padStart(2,'0')}`).flatMap(id =>
    ['baseline','language_rules','conversation_examples'].flatMap(variant =>
      models.flatMap(model => [1,2].map(repeat => {
        const queueItem = exampleQueue.queue.find(x => x.sourceKey === `${id}|${variant}|${repeat}|${model}`);
        return { id, variant, model, repeat, input: queueItem?.sourcePrompt ?? `가상 질문 ${id}`,
          reply: queueItem?.candidateReply ?? '합성 응답',
          evaluation: { rating: queueItem ? 'good':'flat', details: [], source:'synthetic_test' },
          questionDiscrimination: null };
      }))))
};
const proposalPack = { schemaVersion: 'yeoul-feedback-revision-proposals-v1', datasetRole: 'legacy_development_only', proposals: rules };
const line = labels => labels.map(x => `- [ ] ${x}`).join('   ');
const producePacket = () => {
  const a = rules.map((r, i) => `### ${i + 1}. \`${r.ruleId}\`\n\n**초안:** ${r.instructionDraft}\n\n${line(['연구용 규칙 승인', '문구 수정 필요', '제외'])}\n\n**수정·제외 사유:**\n\n`).join('\n');
  const b = Array.from({ length: 12 }, (_, i) => {
    const id = `Y${String(i + 1).padStart(2, '0')}`;
    const group = exampleQueue.queue.filter(x => x.sourceQuestionId === id);
    return `### ${id} — 원 후보 2건 / DeepSeek 후보 1건\n\n` + group.map((x, index) =>
      `**후보 ${index + 1}** · 모델: \`${x.model}\` · 조건: \`${x.variant}\` · 반복: ${x.repeat}\n\n` +
      `원본 키: \`${x.sourceKey}\`\n\n**질문**\n\n> ${x.sourcePrompt}\n\n**응답**\n\n> ${x.candidateReply}\n\n` +
      `${line(['연구용 예시 승인', '수정 후 재검토', '제외'])}\n\n**수정·제외 사유:**\n\n`).join('\n');
  }).join('\n');
  return `# 여울 AI — 대사 24건·행동 규칙 6건 검토표\n\n- [ ] 캐릭터 기준 인격(\`scripts/run-yeoul-four-model-288-v1.mjs#PERSONA_CORE\`)을 연구 실험용으로 확인했습니다.\n\n## A. 규칙 후보 6건\n\n${a}\n## B. 대사 24건 검토\n\n${b}\n## C. 완료 확인\n\n- [ ] 6개 규칙 중 사용할 항목 및 수정 문구를 확정했습니다.\n- [ ] 24개 대사 후보의 승인/수정/제외를 각각 판정했습니다.\n- [ ] 검토한 원본 인격 기준과 캐릭터 Bible·Runtime의 승인 범위를 확인했습니다.\n- [ ] 유료 신규 실험을 진행할 경우 별도로 최대 호출 수·비용 상한·중단 조건을 결정합니다.\n`;
};
const intake = markdown => ingestYeoulReviewPacket({ markdown, exampleQueue, proposalPack, evaluationExport });

test('blank packet stays 30 pending requests; no implicit approvals or spending', () => {
  const r = intake(producePacket());
  assert.deepEqual(r.count, { rules: 6, examples: 24 });
  assert.deepEqual(r.decisions, { pending: 30, approve_requested: 0, revision_requested: 0, excluded: 0 });
  assert.equal(r.ownerApprovalVerified, false);
  assert.deepEqual(r.approvedRulesForPrompt, []);
  assert.deepEqual(r.approvedExamplesForPrompt, []);
  assert.equal(r.readyForPaidExperiment, false);
  assert.equal(r.externalCalls, 0);
  assert.equal(r.completeness.rulesAllDecided, false);
});

test('a checked research approval is only a request, not a reviewed prompt source', () => {
  let markdown = producePacket();
  markdown = markdown.replace('- [ ] 연구용 규칙 승인', '- [x] 연구용 규칙 승인');
  markdown = markdown.replace('- [ ] 연구용 예시 승인', '- [X] 연구용 예시 승인');
  const r = intake(markdown);
  assert.equal(r.decisions.approve_requested, 2);
  assert.equal(r.rules[0].choice, 'approve_requested');
  assert.equal(r.examples[0].choice, 'approve_requested');
  assert.equal(r.ownerApprovalVerified, false);
  assert.equal(r.approvedExamplesForPrompt.length, 0);
});

test('changed source wording, source key, or evaluation queue requires rejection', () => {
  const original = producePacket();
  assert.throws(() => intake(original.replace('가상 답변 Y01-1', '잘못 고친 응답')), /example_text_changed/);
  assert.throws(() => intake(original.replace('Y01\|baseline\|1\|deepseek\/deepseek-v4.1-flash-1017', 'Y12|baseline|1|deepseek/deepseek-v4.1-flash-1017')), /example_source_identity/);
  assert.throws(() => ingestYeoulReviewPacket({ markdown: original,
    exampleQueue: { ...exampleQueue, queue: exampleQueue.queue.map((x, i) => i === 0 ? { ...x, userRating: 'fiction' } : x) }, proposalPack, evaluationExport }), /queue_approval_or_duplicate/);
  assert.throws(() => ingestYeoulReviewPacket({ markdown: original, exampleQueue,
    proposalPack: { ...proposalPack, proposals: proposalPack.proposals.map((r, i) => i === 0 ? { ...r, reviewStatus: 'approved' } : r) }, evaluationExport }), /legacy_unreviewed_sources_required/);
});

test('multiple mutually exclusive checks and unreasoned revision/exclusion are blocked', () => {
  const md = producePacket();
  assert.throws(() => intake(md.replace('- [ ] 연구용 규칙 승인   - [ ] 문구 수정 필요', '- [x] 연구용 규칙 승인   - [x] 문구 수정 필요')), /conflicting_decisions/);
  assert.throws(() => intake(md.replace('- [ ] 수정 후 재검토', '- [x] 수정 후 재검토')), /revision_or_exclusion_note_required/);
  assert.throws(() => intake(md.replace('- [ ] 제외', '- [x] 제외')), /revision_or_exclusion_note_required/);
  assert.throws(() => intake(md.replace('**초안:** 기존 검토 규칙 1.', '**초안:** 승인되지 않은 새 설정')), /modified_rule_text/);
});

test('cannot substitute a forged or unrelated evaluation export for the 288 human labels', () => {
  const markdown = producePacket();
  assert.throws(() => ingestYeoulReviewPacket({ markdown, exampleQueue, proposalPack,
    evaluationExport: { ...evaluationExport, responses: evaluationExport.responses.slice(1) } }), /evaluation_288_source_required/);
  assert.throws(() => ingestYeoulReviewPacket({ markdown, exampleQueue, proposalPack,
    evaluationExport: { ...evaluationExport, responses: evaluationExport.responses.map((x, i) => i === 0 ? { ...x, questionDiscrimination: 'high' } : x) } }), /evaluation_matrix_or_rating/);
  const first = exampleQueue.queue[0].sourceKey;
  assert.throws(() => ingestYeoulReviewPacket({ markdown, exampleQueue, proposalPack,
    evaluationExport: { ...evaluationExport, responses: evaluationExport.responses.map(x => `${x.id}|${x.variant}|${x.repeat}|${x.model}` === first ? { ...x, evaluation: { rating:'fiction' } } : x) } }), /queue_not_supported_by_user_evaluation/);
});

test('false completion and altered review identity cannot turn blanks into approved data', () => {
  const md = producePacket();
  assert.throws(() => intake(md.replace('- [ ] 24개 대사 후보의 승인/수정/제외를 각각 판정했습니다.', '- [x] 24개 대사 후보의 승인/수정/제외를 각각 판정했습니다.')), /false_completion_marker/);
  assert.throws(() => intake(md.replace('- [ ] 검토한 원본 인격 기준과 캐릭터 Bible·Runtime의 승인 범위를 확인했습니다.', '- [x] 검토한 원본 인격 기준과 캐릭터 Bible·Runtime의 승인 범위를 확인했습니다.')), /unverified_persona_marker/);
  assert.throws(() => intake(md.replace('### Y12 —', '### Y01 —')), /question_coverage/);
});

test('review decision notes are captured without rewriting original text or prompt material', () => {
  const orig = producePacket();
  const md = orig.replace('- [ ] 연구용 규칙 승인   - [ ] 문구 수정 필요   - [ ] 제외\n\n**수정·제외 사유:**',
    '- [ ] 연구용 규칙 승인   - [x] 문구 수정 필요   - [ ] 제외\n\n**수정·제외 사유:**\n\n말투 검토 요청');
  const r = intake(md);
  assert.equal(r.decisions.revision_requested, 1);
  assert.equal(r.rules[0].note, '말투 검토 요청');
  assert.equal(r.rules[0].choice, 'revision_requested');
  assert.equal(r.rules[0].sourceStatus, 'pending_character_owner_review');
});

test('archival auto fields can be prepared in memory without granting any of 30 review decisions', () => {
  const original = structuredClone(evaluationExport);
  original.sourceExperiment = { attemptedCalls: 288, successfulCalls: 288 };
  original.surveyState = { groups: Object.fromEntries(Array.from({ length: 9 }, (_, i) =>
    ['group-' + i, { discrimination: 'auto_unreviewed' }])) };
  original.responses.forEach((row, i) => { if (i % 8 === 0) row.questionDiscrimination = 'auto_unreviewed'; });
  const snapshot = JSON.stringify(original);
  assert.throws(() => ingestYeoulReviewPacket({ markdown: producePacket(), exampleQueue, proposalPack,
    evaluationExport: original }), /evaluation_matrix_or_rating/);
  const prepared = preparePrivateYeoulForResearch(original, { knownOriginalAutoFields: true });
  const result = ingestYeoulReviewPacket({ markdown: producePacket(), exampleQueue, proposalPack, evaluationExport: prepared });
  assert.deepEqual(result.count, { rules: 6, examples: 24 });
  assert.equal(result.decisions.pending, 30);
  assert.equal(result.ownerApprovalVerified, false);
  assert.equal(result.readyForPaidExperiment, false);
  assert.equal(result.externalCalls, 0);
  assert.equal(JSON.stringify(original), snapshot);
});
