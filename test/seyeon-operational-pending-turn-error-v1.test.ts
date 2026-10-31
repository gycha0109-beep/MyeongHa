import {describe,expect,it} from 'vitest';
import {
  classifySeyeonFirstPositiveMemoryFailureV1,
} from '../apps/api/src/seyeon-first-positive-memory-fetch-delivery-v1.js';

const requestId='d876a229-aeac-4824-b8cf-b850d8dac101';

describe('Se-yeon operational failed-turn error classification',()=>{
  it('maps the exact DB in-flight reason to a static retryable 409',async()=>{
    const failure=Object.assign(new Error('private turn data MUST stay private'),{
      code:'P0001',
      constraint:'cmd_chat_receive_turn_in_flight',
      detail:'secret assistant reply MUST stay private',
    });
    const response=classifySeyeonFirstPositiveMemoryFailureV1(failure,requestId);
    const body=await response.text();
    expect(response.status).toBe(409);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(body)).toMatchObject({
      ok:false,error:{code:'TURN_IN_FLIGHT',messageKey:'chat.turn_in_flight',
        retryable:true},
    });
    expect(body).not.toContain(failure.message);
    expect(body).not.toContain(failure.detail);
  });
  it.each([
    {code:'P0001',constraint:'seyeon_secret_source_failure'},
    {code:'23514',constraint:'cmd_chat_receive_turn_in_flight'},
    {code:'P0001',constraint:'cmd_chat_receive_turn_in_flight_extra'},
    {code:'P0001',constraint:null},
    new Error('private provider error'),
  ])('keeps non-whitelisted runtime errors as privacy-safe 503 (%s)',async(error)=>{
    const response=classifySeyeonFirstPositiveMemoryFailureV1(error,requestId);
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatchObject({
      code:'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE',retryable:false,
    });
  });
});
