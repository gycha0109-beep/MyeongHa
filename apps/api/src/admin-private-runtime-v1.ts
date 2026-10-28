import { createAdminSupabaseOwnerAuthV1 } from './admin-auth-v1.js';
import { createAdminReadHttpHandlerV1 } from './admin-read-http-v1.js';
import { createAdminPostgresReadPortV1 } from './admin-postgres-read-v1.js';
import { createAdminPostgresAuditPortV1 } from './admin-audit-postgres-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';
import { MYEONGHA_PRODUCTION_SUPABASE_ORIGIN } from './production-user-data-runtime-config.js';
import { createAdminCommandHttpHandlerV1 } from './admin-command-http-v1.js';
import { createAdminPresentationPostgresV1 } from './admin-presentation-postgres-v1.js';
import { createAdminAnalyticsDashboardHttpHandlerV1 } from './admin-analytics-pipeline-http-v1.js';
import { createAdminAnalyticsPipelineReadPortV1 } from './admin-analytics-pipeline-postgres-v1.js';
import { createAdminAiFinanceHttpHandlerV1 } from './admin-ai-cost-http-v1.js';
import { createAdminAiFinanceReadPortV1 } from './admin-ai-cost-read-v1.js';
import type { AdminAiBillingEvidencePortV1, AdminAiFxEvidenceV1 } from './admin-ai-cost-finance-v1.js';
import type { AdminAiBudgetBillingV1, AdminAiBudgetWindowV1 } from './admin-ai-budget-v1.js';
import {createAdminCreditPostgresV1} from './admin-credit-postgres-v1.js';
import {createAdminAiBudgetReadV1,createAdminAiBudgetHttpV1} from './admin-ai-budget-read-v1.js';
import type{AdminAnalyticsCollectionPolicyV1,AdminAnalyticsCoverageV1}from'./admin-analytics-pipeline-v1.js';

export interface AdminPrivateRuntimeEnvV1 {
  readonly MYEONGHA_ADMIN_PRIVATE_ENABLED?: string;
  readonly MYEONGHA_ADMIN_OWNER_AUTH_USER_ID?: string;
  readonly MYEONGHA_ADMIN_OWNER_EMAIL?: string;
  readonly MYEONGHA_ADMIN_SUPABASE_ORIGIN?: string;
  readonly MYEONGHA_SUPABASE_API_KEY?: string;
  readonly MYEONGHA_ADMIN_ORIGIN?: string;
  readonly MYEONGHA_ADMIN_CONFIRMATION_SECRET?: string;
  readonly MYEONGHA_ADMIN_CREDIT_COMMANDS_ENABLED?: string;
}
export interface CreateAdminPrivateRuntimeInputV1 {
  readonly env: AdminPrivateRuntimeEnvV1;
  readonly readPool: PostgresSubjectPoolV1;
  readonly auditPool: PostgresSubjectPoolV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
  readonly commandPool?: PostgresSubjectPoolV1;
  readonly analytics?: {readonly collection:AdminAnalyticsCollectionPolicyV1;readonly coverage?:AdminAnalyticsCoverageV1};
  /** Server-injected provider billing/FX evidence only; never parsed from browser or request body. */
  readonly aiFinanceEvidence?: {readonly billing?:AdminAiBillingEvidencePortV1;readonly fx?:AdminAiFxEvidenceV1};
  /** Window-bound source adapters must not assert complete billing until the provider confirms it. */
  readonly aiBudgetEvidence?: {readonly billing?:(window:AdminAiBudgetWindowV1)=>Promise<AdminAiBudgetBillingV1|undefined>;readonly fx?:(window:AdminAiBudgetWindowV1)=>Promise<AdminAiFxEvidenceV1|undefined>};
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class AdminPrivateRuntimeUnavailableV1 extends Error {
  constructor() {
    super('Privileged administrator runtime is not approved or configured.');
    this.name = 'AdminPrivateRuntimeUnavailableV1';
  }
}

// Not imported or mounted by the public API. A separate private hosting,
// deployment and least-privilege database authorization gate is mandatory.
export function createAdminPrivateRuntimeV1(input: CreateAdminPrivateRuntimeInputV1) {
  const env = input.env;
  if (env.MYEONGHA_ADMIN_PRIVATE_ENABLED !== 'true' ||
      typeof env.MYEONGHA_ADMIN_OWNER_AUTH_USER_ID !== 'string' ||
      !UUID.test(env.MYEONGHA_ADMIN_OWNER_AUTH_USER_ID) ||
      typeof env.MYEONGHA_ADMIN_OWNER_EMAIL!=='string'||!/^\S+@\S+\.\S+$/u.test(env.MYEONGHA_ADMIN_OWNER_EMAIL)||
      env.MYEONGHA_ADMIN_SUPABASE_ORIGIN !== MYEONGHA_PRODUCTION_SUPABASE_ORIGIN ||
      typeof env.MYEONGHA_SUPABASE_API_KEY !== 'string' ||
      env.MYEONGHA_SUPABASE_API_KEY.trim().length < 20) {
    throw new AdminPrivateRuntimeUnavailableV1();
  }
  const auth = createAdminSupabaseOwnerAuthV1({
    ownerAuthUserId: env.MYEONGHA_ADMIN_OWNER_AUTH_USER_ID,
    ownerEmail:env.MYEONGHA_ADMIN_OWNER_EMAIL,
    supabaseOrigin: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
    supabaseApiKey: env.MYEONGHA_SUPABASE_API_KEY,
    ...(input.memberFetchImpl === undefined ? {} : { fetchImpl: input.memberFetchImpl }),
  });
  const reads = createAdminPostgresReadPortV1({ pool: input.readPool });
  const audit = createAdminPostgresAuditPortV1({ pool: input.auditPool });
  const reading = createAdminReadHttpHandlerV1({ auth, reads, audit });
  const presentation = input.commandPool === undefined ? undefined : createAdminPresentationPostgresV1({pool:input.commandPool});
  const credit=input.commandPool===undefined||env.MYEONGHA_ADMIN_CREDIT_COMMANDS_ENABLED!=='true'?undefined:createAdminCreditPostgresV1({pool:input.commandPool});
  const commands = createAdminCommandHttpHandlerV1({auth,audit,allowedOrigin:env.MYEONGHA_ADMIN_ORIGIN??'http://127.0.0.1:4184',
    ...(presentation === undefined ? {} : {commands:{bindings:[presentation.binding,...(credit?[credit.binding]:[])],presentations:presentation.queries,...(credit?{creditHistory:credit.history}:{})}}),
    ...(env.MYEONGHA_ADMIN_CONFIRMATION_SECRET === undefined ? {} : {confirmationSigningSecret:env.MYEONGHA_ADMIN_CONFIRMATION_SECRET})});
  const analytics = createAdminAnalyticsDashboardHttpHandlerV1({auth,audit,reads:createAdminAnalyticsPipelineReadPortV1({pool:input.readPool,...input.analytics})});
  const finance = createAdminAiFinanceHttpHandlerV1({auth,audit,reads:createAdminAiFinanceReadPortV1({pool:input.readPool,...(input.aiFinanceEvidence??{})})});
  const budget=createAdminAiBudgetHttpV1({auth,audit,read:createAdminAiBudgetReadV1({pool:input.readPool,...(input.aiBudgetEvidence??{})})});
  return Object.freeze({
    handleRequest(request:Request):Promise<Response> {
      const path=new URL(request.url).pathname;
      if(path.startsWith('/api/admin/commands/')||path==='/api/admin/presentations'||path==='/api/admin/presentations/history'||path==='/api/admin/credits/history')return commands(request);
      if(path==='/api/admin/ai-budget')return budget(request);
      if(path==='/api/admin/analytics-dashboard')return analytics(request);
      if(path.startsWith('/api/admin/ai-finance/'))return finance(request);
      return reading(request);
    },
  });
}
