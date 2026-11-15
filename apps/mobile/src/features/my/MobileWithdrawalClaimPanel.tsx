import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { DigitalReadingWithdrawalReasonV1 } from '@myeongha/api-client';

import { subscribeMobileSubjectCredentialChangesV1 } from
  '@/core/session/mobile-subject-credential-changes';
import { mobileColors } from '@/ui/mobile-colors';
import {
  nativeMobileWithdrawalClaimServiceV1,
} from './native-mobile-withdrawal-claim-service';

const OPTIONS: ReadonlyArray<readonly [DigitalReadingWithdrawalReasonV1,string]> = [
  ['not_provided','콘텐츠 미제공'], ['delivery_failed','전달 실패'],
  ['change_of_mind','단순 변심'], ['not_as_described','설명과 다름'],
  ['defect','서비스 하자'], ['duplicate_charge','중복 결제'],
  ['unprovided_separable_part','일부 미제공'], ['other','기타'],
];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
type Accepted=Readonly<{claimId:string;receivedAt:string}>;
const STATUS:Readonly<Record<string,string>>=Object.freeze({
  received:'접수 완료 · 검토 대기',
  refund_decision_recorded:'환불 결정 기록됨 · 결제사 처리 전',
  refund_processing:'결제사 환불 처리 확인 중',
  refund_confirmed:'결제사 환불 확인 완료',
});

/**
 * A release-gated form: no customer request is treated as refund approval.
 * The server must independently persist a claim and confirm the receipt.
 */
export function MobileWithdrawalClaimPanel(){
  const [reason,setReason]=useState<DigitalReadingWithdrawalReasonV1>('not_provided');
  const [purchase,setPurchase]=useState('');
  const [unit,setUnit]=useState('');
  const [nonce,setNonce]=useState<string|null>(null);
  const [accepted,setAccepted]=useState<Accepted|null>(null);
  const [status,setStatus]=useState('received');
  const [pending,setPending]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const epoch=useRef(0);
  const busy=useRef(false);

  useEffect(()=>{
    const reset=()=>{
      epoch.current+=1;
      busy.current=false;
      setPending(false);
      setAccepted(null);
      setNonce(null);
      setStatus('received');
      setError(null);
    };
    const unsubscribe=subscribeMobileSubjectCredentialChangesV1(reset);
    return ()=>{epoch.current+=1;unsubscribe();};
  },[]);

  function changed(){
    setNonce(null);
    setError(null);
  }
  async function submit(){
    if(busy.current||accepted)return;
    const scoped=purchase.trim().length>0||unit.trim().length>0;
    if(scoped&&(!UUID.test(purchase.trim())||!UUID.test(unit.trim()))){
      setError('구매 ID와 구매 단위 ID를 함께 입력하거나 둘 다 비워 주세요.');
      return;
    }
    let requestNonce=nonce;
    if(!requestNonce){
      // Require a cryptographically secure native UUID to deduplicate retries.
      const crypto=globalThis.crypto;
      if(typeof crypto?.randomUUID!=='function'){
        setError('보안용 접수 번호를 생성할 수 없습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      requestNonce=crypto.randomUUID();
      setNonce(requestNonce);
    }
    busy.current=true;
    setPending(true);setError(null);
    const currentEpoch=epoch.current;
    try{
      const result=await nativeMobileWithdrawalClaimServiceV1.submitWithCurrentStatus({
        reason,idempotencyKey:requestNonce,
        ...(scoped?{purchaseIntentId:purchase.trim(),unitId:unit.trim()}:{}),
      });
      if(currentEpoch!==epoch.current)return;
      setAccepted({
        claimId:result.submitted.claimId,
        receivedAt:result.submitted.receivedAt,
      });
      setStatus(result.currentStatus);
      if(result.statusLookupUnavailable){
        setError('접수는 확인됐지만 현재 처리 상태는 확인하지 못했습니다. 상태 새로고침을 눌러 주세요.');
      }
    }catch(e){
      if(currentEpoch===epoch.current)setError(
        e instanceof Error && e.message.includes('MOBILE_MEMBER_REQUIRED')
          ? '회원 로그인이 필요합니다.'
          : '접수 결과를 확인하지 못했습니다. 동일한 내용으로 다시 시도해 주세요.',
      );
      // Preserve the nonce across uncertain retries; the server deduplicates it.
    }finally{
      if(currentEpoch===epoch.current){busy.current=false;setPending(false);}
    }
  }

  async function refresh(){
    if(busy.current||!accepted)return;
    busy.current=true;setPending(true);setError(null);
    const currentEpoch=epoch.current;
    try{
      const result=await nativeMobileWithdrawalClaimServiceV1.readStatus(accepted.claimId);
      if(currentEpoch!==epoch.current)return;
      if(result.claimId!==accepted.claimId)throw Error('CLAIM_ID_MISMATCH');
      setStatus(result.status);
    }catch{
      if(currentEpoch===epoch.current)setError('접수 상태를 확인하지 못했습니다.');
    }finally{
      if(currentEpoch===epoch.current){busy.current=false;setPending(false);}
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>청약철회 및 환불 요청</Text>
      <Text style={styles.explain}>
        접수는 환불 승인이 아닙니다. 제공 여부와 환불 사유는 별도로 검토합니다.
      </Text>
      {accepted?(
        <View style={styles.receipt} accessibilityLiveRegion="polite">
          <Text style={styles.label}>접수번호: {accepted.claimId}</Text>
          <Text style={styles.label}>접수시각: {new Date(accepted.receivedAt).toLocaleString('ko-KR')}</Text>
          <Text style={styles.status}>{STATUS[status]??'상태 확인 필요'}</Text>
          <Pressable accessibilityRole="button" disabled={pending}
            style={[styles.action,pending&&styles.disabled]} onPress={()=>void refresh()}>
            <Text style={styles.actionText}>{pending?'확인 중…':'처리 상태 새로고침'}</Text>
          </Pressable>
        </View>
      ):(
        <>
          <Text style={styles.label}>접수 사유</Text>
          <View style={styles.options}>
            {OPTIONS.map(([key,label])=>(
              <Pressable key={key} accessibilityRole="button" disabled={pending}
                accessibilityState={{selected:reason===key,disabled:pending}}
                onPress={()=>{setReason(key);changed();}}
                style={[styles.option,reason===key&&styles.selected]}>
                <Text style={styles.optionText}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>구매 ID (선택)</Text>
          <TextInput style={styles.input} value={purchase} editable={!pending}
            accessibilityLabel="구매 ID" maxLength={36} autoCapitalize="none"
            placeholder="알고 계시면 입력" placeholderTextColor={mobileColors.muted}
            onChangeText={v=>{setPurchase(v);changed();}} />
          <Text style={styles.label}>구매 단위 ID (선택)</Text>
          <TextInput style={styles.input} value={unit} editable={!pending}
            accessibilityLabel="구매 단위 ID" maxLength={36} autoCapitalize="none"
            placeholder="모르면 구매 ID와 함께 빈칸 유지"
            placeholderTextColor={mobileColors.muted}
            onChangeText={v=>{setUnit(v);changed();}} />
          <Pressable accessibilityRole="button" disabled={pending}
            style={[styles.action,pending&&styles.disabled]} onPress={()=>void submit()}>
            <Text style={styles.actionText}>{pending?'접수 중…':'청약철회 요청 접수'}</Text>
          </Pressable>
        </>
      )}
      {error?<Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>:null}
    </View>
  );
}

const styles=StyleSheet.create({
  card:{backgroundColor:mobileColors.surface,borderColor:mobileColors.border,
    borderWidth:1,borderRadius:18,padding:17,gap:11},
  heading:{fontSize:17,fontWeight:'800',color:mobileColors.ink},
  explain:{fontSize:12,color:mobileColors.muted,lineHeight:19},
  label:{fontSize:12,fontWeight:'700',color:mobileColors.ink},
  status:{fontSize:13,fontWeight:'800',color:mobileColors.navy},
  options:{flexDirection:'row',flexWrap:'wrap',gap:7},
  option:{borderRadius:9,borderWidth:1,borderColor:mobileColors.border,
    paddingVertical:9,paddingHorizontal:10},
  selected:{borderColor:mobileColors.navy,backgroundColor:mobileColors.canvas},
  optionText:{fontSize:12,color:mobileColors.ink},
  input:{minHeight:45,borderWidth:1,borderRadius:10,
    borderColor:mobileColors.border,color:mobileColors.ink,
    paddingHorizontal:12,backgroundColor:mobileColors.canvas},
  action:{minHeight:46,borderRadius:12,alignItems:'center',justifyContent:'center',
    backgroundColor:mobileColors.navy,paddingHorizontal:12},
  actionText:{color:mobileColors.surface,fontSize:14,fontWeight:'800'},
  receipt:{gap:9},
  disabled:{opacity:0.5},
  error:{fontSize:12,color:mobileColors.seal},
});
