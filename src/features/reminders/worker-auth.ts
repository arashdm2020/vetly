import 'server-only';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { equalSecret } from '@/lib/auth';

export const workerAudience='https://vetly-kappa.vercel.app/api/internal/reminders/process';
const issuer='https://token.actions.githubusercontent.com';
const githubKeys=createRemoteJWKSet(new URL(issuer+'/.well-known/jwks'),{timeoutDuration:8000});
const repository='arashdm2020/vetly';
const ref='refs/heads/main';
const subjects=[`repo:${repository}:ref:${ref}`,'repo:arashdm2020@114090010/vetly@1368496594:ref:'+ref];

// Only this repository's default-branch scheduler can use GitHub identity.
// Key injection is for offline signature/claims tests, never controlled by HTTP input.
export async function githubWorkerAuthorized(token:string,keys:JWTVerifyGetKey=githubKeys) {
  try {
    if(token.length>10000||token.split('.').length!==3)return false;
    const {payload}=await jwtVerify(token,keys,{issuer,audience:workerAudience,algorithms:['RS256'],
      maxTokenAge:'10 minutes',clockTolerance:5,requiredClaims:['exp','iat','nbf','sub']});
    return payload.repository===repository&&payload.repository_id==='1368496594'&&payload.repository_owner_id==='114090010'
      &&payload.ref===ref&&payload.workflow_ref===`${repository}/.github/workflows/reminders.yml@${ref}`
      &&payload.runner_environment==='github-hosted'&&['schedule','workflow_dispatch'].includes(String(payload.event_name))
      &&subjects.includes(String(payload.sub));
  } catch {return false;}
}
export async function workerAuthorized(request:Request) {
  const header=request.headers.get('authorization')??'';
  const secret=process.env.CRON_SECRET;
  if(secret&&secret.length>=32&&equalSecret(header,'Bearer '+secret))return true;
  if(!header.startsWith('Bearer '))return false;
  return githubWorkerAuthorized(header.slice(7));
}
