import { createHash } from 'node:crypto';
import type { OfficialReadingRecordV1 } from './official-reading-record-read.js';
import {
  buildOfficialWealthLunaSourceV1,
  type OfficialWealthLunaSourceV1,
} from './official-wealth-luna-reader-v1.js';
import type { WealthProductChapterPlacementDecisionV1 } from '../../../packages/domain/src/saju-wealth-chapter-placement-v1.js';
import { getSajuProductChapterBlueprintV1 } from '../../../packages/domain/src/saju-product-chapter-blueprints-v1.js';

export const WEALTH_NOTION_LUNA_PRODUCT_SOURCE_VERSION_V1 =
  'myeongha-wealth-notion-sixchapter-source-v1' as const;

/** The server host may install this only after a signed Saju source and
 * owner-scoped Reader plan have been independently validated. A model adapter
 * cannot implement this authority by constructing generic prose. */
export interface OfficialWealthLunaProductSourceAuthorityV1 {
  readonly getSixChapterSourceFromApprovedPlan: (
    issued: OfficialReadingRecordV1,
  ) => Promise<OfficialWealthLunaSourceV1 | null>;
}

export interface SignedNativeReadingToIssuedRecordBindingV1 {
  /** Supplied by the existing signed canonical Saju Source verifier and the
   * owner-scoped approved Reader authority, never by the client. Native
   * Saju source IDs/hashes must NOT be confused with the issued DB IDs/hashes.
   */
  readonly issuedReadingId: string;
  /** The archived DB Response digest is the V1 projected bundle source hash. */
  readonly issuedResponseHash: `sha256:v1:${string}`;
  readonly canonicalGroundingHash: string;
  /** Preserved native source proof lineage; checked by signed source verifier. */
  readonly nativeSourceResponseHash: string;
  readonly nativeExecutionAttemptId: string;
}

/**
 * A 6-chapter PRODUCT input, not the earlier 2-chapter generic synthetic
 * experiment. The caller must have verified the paid Reading, current grant,
 * native Saju source proof, existing perspective and source-owned selection.
 *
 * No new Saju claim is generated. A missing chapter is a hard HOLD, not a
 * license to fill its pages with unrelated financial advice.
 */
export function buildNotionWealthSixChapterLunaSourceV1(input:Readonly<{
  issued:OfficialReadingRecordV1;
  placement:WealthProductChapterPlacementDecisionV1;
  verifiedBinding:SignedNativeReadingToIssuedRecordBindingV1;
  requiredProtectedDisclosures:Readonly<Record<string,string>>;
}>):OfficialWealthLunaSourceV1|null {
  const original=buildOfficialWealthLunaSourceV1(input.issued);
  if(original===null || input.placement.state!=='ready' ||
      input.placement.characterId!=='taegyeom')return null;
  const {issuedReadingId,issuedResponseHash,canonicalGroundingHash,
    nativeSourceResponseHash,nativeExecutionAttemptId}=input.verifiedBinding;
  if(issuedReadingId!==input.issued.readingId ||
      input.placement.readingRef!==issuedReadingId ||
      !/^sha256:v1:[0-9a-f]{64}$/u.test(issuedResponseHash) ||
      issuedResponseHash.slice('sha256:v1:'.length)!==input.placement.sourceResponseHash ||
      canonicalGroundingHash!==input.placement.groundingHash ||
      !/^[0-9a-f]{64}$/u.test(nativeSourceResponseHash) ||
      !nativeExecutionAttemptId.trim()) {
    throw new TypeError('Wealth Luna product source does not match verified Saju origin');
  }
  const expected=getSajuProductChapterBlueprintV1('wealth');
  if(input.placement.chapters.length!==6 ||
      input.placement.chapters.some((chapter,index)=>
        chapter.chapterId!==expected[index]?.chapterId ||
        chapter.fixedTitle!==expected[index]?.fixedTitle ||
        chapter.status!=='grounded' || chapter.primaryUnitIds.length===0 ||
        chapter.evidence.length===0))return null;
  const allRequired=[...new Set(input.placement.chapters.flatMap(ch=>
    ch.requiredDisclosureRefs))];
  for(const id of allRequired){
    if(!Object.hasOwn(input.requiredProtectedDisclosures,id) ||
        !input.requiredProtectedDisclosures[id]?.trim()) {
      throw new TypeError('Approved Saju disclosure is not available');
    }
  }
  const chapters=input.placement.chapters.map((chapter,index)=>{
    const entries=chapter.evidence;
    const referenced=new Set(entries.map(e=>e.unitId));
    if([...chapter.primaryUnitIds,...chapter.supportingUnitIds,
      ...chapter.tensionUnitIds].some(id=>!referenced.has(id))) {
      throw new TypeError('Wealth chapter evidence ref not found');
    }
    const excerpts=entries.map(item=>{
      if(!item.canonicalMeaning.trim() || !item.sourceBlockRefs.length ||
          !item.semanticKey.trim())throw new TypeError('Missing approved Saju meaning or provenance');
      const conditions=item.qualifiers.length>0
        ? '\n적용 조건: '+item.qualifiers.join(' · ') : '';
      const prohibited=item.prohibitedExtensions.length>0
        ? '\n금지 확장: '+item.prohibitedExtensions.join(' · ') : '';
      return [
        '승인 의미 ['+item.unitId+']',
        item.canonicalMeaning,
        '근거 블록: '+item.sourceBlockRefs.join(', '),
        conditions.trim(),prohibited.trim(),
      ].filter(Boolean).join('\n');
    });
    if(new Set(entries.map(e=>e.unitId)).size!==entries.length) {
      throw new TypeError('Duplicate Saju meaning reused in same chapter');
    }
    return Object.freeze({
      index,
      title:chapter.fixedTitle,
      excerpts:Object.freeze(excerpts),
    });
  });
  const limitations=[
    ...original.limitations,
    ...allRequired.map(id=>input.requiredProtectedDisclosures[id]!),
  ];
  const sourceHash=createHash('sha256').update(JSON.stringify({
    productVersion:WEALTH_NOTION_LUNA_PRODUCT_SOURCE_VERSION_V1,
    readingId:original.readingId,
    groundingHash:input.placement.groundingHash,
    issuedResponseHash, nativeSourceResponseHash,nativeExecutionAttemptId,
    planId:input.placement.planId,
    chapters,limitations,
  })).digest('hex');
  return Object.freeze({
    ...original,
    sourceHash,
    chapters:Object.freeze(chapters),
    limitations:Object.freeze(limitations),
  });
}
