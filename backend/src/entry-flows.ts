import { randomUUID, createHash } from 'node:crypto';
import { PostgresRepository } from './repository.js';
import { ContactCipher } from './security.js';

export type EntryEventType='family.created'|'member.created'|'profile.updated'|'sharing.updated'|'message.created'|'gathering.created';
/** Call ONLY from the transaction which saves the corresponding entry. */
export class EntryFlowService {
  constructor(private cipher:ContactCipher){}
  async enqueue(repo:PostgresRepository,familyId:string,actorId:string,type:EntryEventType,data:unknown){
    const id=randomUUID(),event={version:1,id,familyId,actorId,type,recordedAt:new Date().toISOString(),data};
    await repo.query('INSERT INTO entry_flows(id,family_id,actor_id,event_type,encrypted_payload) VALUES($1,$2,$3,$4,$5)',[id,familyId,actorId,type,this.cipher.encrypt(JSON.stringify(event))]);
  }
}
export interface ArchiveStorage { reserveId():Promise<string>; put(id:string,eventId:string,encryptedPayload:string):Promise<void> }

/** OAuth is for an operator-owned Drive folder, not an end user's login session. */
export class GoogleDriveStorage implements ArchiveStorage {
  private accessToken='';private expiresAt=0;
  constructor(private config:{clientId:string;clientSecret:string;refreshToken:string;folderId:string},private fetcher:typeof fetch=fetch){}
  private async token(){
    if(Date.now()<this.expiresAt)return this.accessToken;
    const res=await this.fetcher('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:this.config.clientId,client_secret:this.config.clientSecret,refresh_token:this.config.refreshToken,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
    if(!res.ok)throw new Error(`Drive OAuth failed (${res.status})`);const data=await res.json() as {access_token:string;expires_in:number};this.accessToken=data.access_token;this.expiresAt=Date.now()+(data.expires_in-60)*1000;return this.accessToken;
  }
  private async call(url:string,init:RequestInit={}){const res=await this.fetcher(url,{...init,headers:{...init.headers,Authorization:`Bearer ${await this.token()}`},signal:AbortSignal.timeout(20000)});return res;}
  async verifyFolder(){const res=await this.call(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(this.config.folderId)}?fields=id,mimeType,trashed,capabilities(canAddChildren)&supportsAllDrives=true`);if(!res.ok)throw new Error(`Drive folder is inaccessible (${res.status})`);const f=await res.json() as {mimeType:string;trashed:boolean;capabilities?:{canAddChildren?:boolean}};if(f.mimeType!=='application/vnd.google-apps.folder'||f.trashed||!f.capabilities?.canAddChildren)throw new Error('The configured Drive folder is not writable');}
  async reserveId(){const res=await this.call('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files');if(!res.ok)throw new Error(`Drive ID reservation failed (${res.status})`);const data=await res.json() as {ids:string[]};if(!data.ids?.[0])throw new Error('Drive did not return a file ID');return data.ids[0];}
  async put(id:string,eventId:string,encryptedPayload:string){
    const boundary=`myroots_${randomUUID()}`,metadata={id,name:`entry-${eventId}.enc`,mimeType:'application/octet-stream',parents:[this.config.folderId],appProperties:{myrootsEventId:eventId}};
    const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n${encryptedPayload}\r\n--${boundary}--`;
    const res=await this.call('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});
    if(res.ok)return;
    if(res.status===409){
      const existing=await this.call(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,parents,appProperties,md5Checksum&supportsAllDrives=true`);
      if(existing.ok){const data=await existing.json() as {parents?:string[];appProperties?:Record<string,string>;md5Checksum:string};if(data.appProperties?.myrootsEventId===eventId&&data.parents?.includes(this.config.folderId)&&data.md5Checksum===createHash('md5').update(encryptedPayload).digest('hex'))return;}
    }
    throw new Error(`Drive archival failed (${res.status})`);
  }
}

/** An outbox avoids losing entries when Drive is unavailable. One file ID per event. */
export class EntryFlowWorker {
  constructor(private repo:PostgresRepository,private storage:ArchiveStorage){}
  async processOne():Promise<boolean>{
    const [entry]=await this.repo.query(`UPDATE entry_flows SET status='processing',attempts=attempts+1,lease_until=now()+interval '2 minutes'
      WHERE id=(SELECT id FROM entry_flows WHERE ((status='pending' AND available_at<=now()) OR (status='processing' AND lease_until<now())) AND attempts<8 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`);
    if(!entry){await this.repo.query("UPDATE entry_flows SET status='dead',last_error='Worker lease expired after final attempt' WHERE status='processing' AND lease_until<now() AND attempts>=8");return false;}
    try{
      let fileId=entry.remote_file_id as string|undefined;
      if(!fileId){fileId=await this.storage.reserveId();await this.repo.query('UPDATE entry_flows SET remote_file_id=$1 WHERE id=$2',[fileId,entry.id]);}
      await this.storage.put(fileId,entry.id,entry.encrypted_payload);
      await this.repo.query("UPDATE entry_flows SET status='completed',completed_at=now(),lease_until=NULL,last_error=NULL WHERE id=$1",[entry.id]);
    }catch(error){const status=entry.attempts>=8?'dead':'pending';await this.repo.query("UPDATE entry_flows SET status=$1,available_at=now()+($2 * interval '1 second'),lease_until=NULL,last_error=$3 WHERE id=$4",[status,Math.min(3600,30*2**entry.attempts),'Archival failed; check operator configuration and provider availability',entry.id]);}
    return true;
  }
}
