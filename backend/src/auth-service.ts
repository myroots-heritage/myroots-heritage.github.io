import { randomUUID, randomBytes } from 'node:crypto';
import { PostgresRepository } from './repository.js';
import { PasswordHasher, HttpError, tokenHash } from './security.js';
import { EntryFlowService } from './entry-flows.js';
export class AuthService {
  constructor(private repo:PostgresRepository,private flows:EntryFlowService,private passwords=new PasswordHasher()){}
  async register(name:string,email:string,password:string){
    const id=randomUUID(),familyId=randomUUID(),memberId=randomUUID(),hash=await this.passwords.hash(password);
    try{await this.repo.transaction(async r=>{
      await r.query('INSERT INTO accounts(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[id,name,email.toLowerCase(),hash]);
      await r.query('INSERT INTO families(id,name,created_by) VALUES($1,$2,$3)',[familyId,`${name.split(' ').at(-1)} family`,id]);
      await r.query('INSERT INTO members(id,family_id,name,created_by,account_id) VALUES($1,$2,$3,$4,$4)',[memberId,familyId,name,id]);
      await r.query('INSERT INTO memberships(family_id,account_id,member_id) VALUES($1,$2,$3)',[familyId,id,memberId]);
      await this.flows.enqueue(r,familyId,id,'family.created',{familyId,memberId,name});
    });}catch(e){if((e as {code?:string}).code==='23505')throw new HttpError(409,'This email is already registered');throw e;}
    return this.session(id,familyId);
  }
  async login(email:string,password:string){
    const [account]=await this.repo.query('SELECT * FROM accounts WHERE email=$1',[email.toLowerCase()]);
    // Run an equivalent KDF for unknown users to reduce account enumeration by timing.
    const valid=await this.passwords.verify(password,account?.password_hash??`${'0'.repeat(32)}:${'0'.repeat(128)}`);
    if(!account||!valid)throw new HttpError(401,'Email or password is incorrect');
    const [membership]=await this.repo.query('SELECT family_id FROM memberships WHERE account_id=$1 LIMIT 1',[account.id]);
    return this.session(account.id,membership.family_id);
  }
  private async session(accountId:string,familyId:string){const token=randomBytes(32).toString('base64url');await this.repo.query("INSERT INTO sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '7 days')",[tokenHash(token),accountId]);return {token,familyId};}
  async authenticate(token:string|undefined){if(!token)throw new HttpError(401,'Please sign in');const [session]=await this.repo.query('SELECT account_id FROM sessions WHERE token_hash=$1 AND expires_at>now()',[tokenHash(token)]);if(!session)throw new HttpError(401,'Your session has expired');return session.account_id as string;}
  async logout(token:string|undefined){if(token)await this.repo.query('DELETE FROM sessions WHERE token_hash=$1',[tokenHash(token)]);}
}
