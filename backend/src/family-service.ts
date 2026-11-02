import { randomUUID } from 'node:crypto';
import { FamilyGraph, profileFields, type Family, type Member, type MemberInput, type Profile, type Relationship, type Sharing } from '@myroots/shared';
import { PostgresRepository } from './repository.js';
import { ContactCipher, HttpError } from './security.js';
import { EntryFlowService } from './entry-flows.js';
export class FamilyService {
  constructor(private repo:PostgresRepository,private cipher:ContactCipher,private flows:EntryFlowService){}
  async membership(familyId:string,actor:string){const [membership]=await this.repo.query('SELECT member_id FROM memberships WHERE family_id=$1 AND account_id=$2',[familyId,actor]);if(!membership)throw new HttpError(403,'You do not have access to this family');return membership.member_id as string;}
  private async raw(familyId:string){
    const rows=await this.repo.query('SELECT * FROM members WHERE family_id=$1',[familyId]);
    const members:Member[]=rows.map(r=>({id:r.id,familyId:r.family_id,name:r.name,createdBy:r.created_by,accountId:r.account_id,status:r.status,profile:r.profile}));
    const edges=await this.repo.query('SELECT * FROM relationships WHERE family_id=$1',[familyId]);
    const relationships:Relationship[]=edges.map(r=>({id:r.id,familyId:r.family_id,fromId:r.from_id,toId:r.to_id,type:r.type}));return {members,relationships};
  }
  async get(familyId:string,actor:string):Promise<Family>{
    const selfId=await this.membership(familyId,actor),{members,relationships}=await this.raw(familyId),graph=new FamilyGraph(members,relationships);
    const policies=await this.repo.query('SELECT s.* FROM sharing s JOIN members m ON m.id=s.member_id WHERE m.family_id=$1',[familyId]);
    const contacts=await this.repo.query('SELECT c.* FROM private_contacts c JOIN members m ON m.id=c.member_id WHERE m.family_id=$1 AND c.owner_id=$2',[familyId,actor]);
    const policyIndex=new Map(policies.map(p=>[`${p.member_id}:${p.field}`,p]));
    const contactIndex=new Map(contacts.map(c=>[c.member_id,c]));
    const branchAccess=new Map<string,boolean>();
    for(const p of policies)if(p.visibility==='branch'&&!branchAccess.has(p.branch_root_id))branchAccess.set(p.branch_root_id,graph.descendants(p.branch_root_id).has(selfId));
    for(const member of members){
      const owned=member.accountId===actor||(!member.accountId&&member.createdBy===actor);
      const visible:Partial<Profile>={};
      for(const field of profileFields){const rule=policyIndex.get(`${member.id}:${field}`);if(owned||rule?.visibility==='family'||(rule?.visibility==='branch'&&branchAccess.get(rule.branch_root_id)))visible[field]=member.profile?.[field]??'';}
      member.profile=visible;member.city=visible.city;
      const contact=contactIndex.get(member.id);if(contact)member.phone=this.cipher.decrypt(contact.ciphertext);
      delete member.createdBy; // ownership identifiers are not needed by the browser
      delete member.accountId;
    }
    const [family]=await this.repo.query('SELECT name FROM families WHERE id=$1',[familyId]);
    return {id:familyId,name:family.name,members,relationships,selfId,sharing:policies.filter(p=>p.member_id===selfId).map(p=>({field:p.field,visibility:p.visibility,branchRootId:p.branch_root_id??undefined}))};
  }
  async add(familyId:string,actor:string,input:MemberInput){
    await this.membership(familyId,actor);
    return this.repo.transaction(async r=>{
      // Serialize mutations within one family to keep graph invariants atomic.
      await r.query('SELECT id FROM families WHERE id=$1 FOR UPDATE',[familyId]);
      const [relative]=await r.query('SELECT id FROM members WHERE family_id=$1 AND id=$2',[familyId,input.relativeTo]);if(!relative)throw new HttpError(400,'Choose a member of this family');
      const id=randomUUID();await r.query('INSERT INTO members(id,family_id,name,created_by,profile) VALUES($1,$2,$3,$4,$5)',[id,familyId,input.name,actor,JSON.stringify({city:input.city})]);
      if(input.phone)await r.query('INSERT INTO private_contacts(member_id,owner_id,ciphertext) VALUES($1,$2,$3)',[id,actor,this.cipher.encrypt(input.phone)]);
      const edge=async(from:string,to:string,type:string)=>r.query('INSERT INTO relationships(id,family_id,from_id,to_id,type) VALUES($1,$2,$3,$4,$5)',[randomUUID(),familyId,from,to,type]);
      if(input.relation==='parent')await edge(id,input.relativeTo,'parent');
      if(input.relation==='child')await edge(input.relativeTo,id,'parent');
      if(input.relation==='partner')await edge(input.relativeTo,id,'partner');
      if(input.relation==='sibling'){
        const parents=await r.query("SELECT from_id FROM relationships WHERE family_id=$1 AND to_id=$2 AND type='parent'",[familyId,input.relativeTo]);
        if(!parents.length)throw new HttpError(400,'Add a parent to this person before adding a sibling');
        for(const parent of parents)await edge(parent.from_id,id,'parent');
      }
      await r.query("INSERT INTO audit_events(actor_id,family_id,action) VALUES($1,$2,'member.added')",[actor,familyId]);
      await this.flows.enqueue(r,familyId,actor,'member.created',{id,...input});return {id};
    });
  }
  async updateProfile(familyId:string,actor:string,profile:Profile,phone?:string){const selfId=await this.membership(familyId,actor);await this.repo.transaction(async r=>{await r.query('UPDATE members SET profile=$1 WHERE id=$2 AND account_id=$3',[JSON.stringify(profile),selfId,actor]);if(phone!==undefined){if(phone)await r.query('INSERT INTO private_contacts(member_id,owner_id,ciphertext) VALUES($1,$2,$3) ON CONFLICT(member_id,owner_id) DO UPDATE SET ciphertext=$3',[selfId,actor,this.cipher.encrypt(phone)]);else await r.query('DELETE FROM private_contacts WHERE member_id=$1 AND owner_id=$2',[selfId,actor]);}await this.flows.enqueue(r,familyId,actor,'profile.updated',{memberId:selfId,profile,...(phone!==undefined?{phone}:{})});});}
  async updateSharing(familyId:string,actor:string,rules:Sharing[]){
    const selfId=await this.membership(familyId,actor);await this.repo.transaction(async r=>{
      for(const rule of rules){if(rule.visibility==='branch'){const [root]=await r.query('SELECT id FROM members WHERE id=$1 AND family_id=$2',[rule.branchRootId,familyId]);if(!root)throw new HttpError(400,'Choose a branch in this family');}
        await r.query('INSERT INTO sharing(member_id,field,visibility,branch_root_id) VALUES($1,$2,$3,$4) ON CONFLICT(member_id,field) DO UPDATE SET visibility=$3,branch_root_id=$4',[selfId,rule.field,rule.visibility,rule.visibility==='branch'?rule.branchRootId:null]);}
      await r.query("INSERT INTO audit_events(actor_id,family_id,action) VALUES($1,$2,'sharing.updated')",[actor,familyId]);await this.flows.enqueue(r,familyId,actor,'sharing.updated',{memberId:selfId,rules});});
  }
  async messages(familyId:string,actor:string){await this.membership(familyId,actor);const rows=await this.repo.query('SELECT m.*,p.name FROM messages m JOIN members p ON p.id=m.author_id WHERE m.family_id=$1 ORDER BY m.created_at DESC,m.id DESC LIMIT 100',[familyId]);return rows.reverse().map(r=>({id:r.id,familyId:r.family_id,authorId:r.author_id,authorName:r.name,text:r.text,createdAt:r.created_at}));}
  async send(familyId:string,actor:string,text:string){const selfId=await this.membership(familyId,actor),id=randomUUID();await this.repo.transaction(async r=>{await r.query('INSERT INTO messages(id,family_id,author_id,text) VALUES($1,$2,$3,$4)',[id,familyId,selfId,text]);await this.flows.enqueue(r,familyId,actor,'message.created',{id,authorId:selfId,text});});}
  async gatherings(familyId:string,actor:string){await this.membership(familyId,actor);const rows=await this.repo.query('SELECT * FROM gatherings WHERE family_id=$1 ORDER BY date LIMIT 100',[familyId]);return rows.map(r=>({id:r.id,familyId:r.family_id,title:r.title,date:r.date,location:r.location,description:r.description,createdBy:r.created_by}));}
  async plan(familyId:string,actor:string,event:{title:string;date:string;location:string;description:string}){await this.membership(familyId,actor);const id=randomUUID();await this.repo.transaction(async r=>{await r.query('INSERT INTO gatherings(id,family_id,title,date,location,description,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,familyId,event.title,event.date,event.location,event.description,actor]);await this.flows.enqueue(r,familyId,actor,'gathering.created',{id,...event});});}
  async entryFlows(familyId:string,actor:string){await this.membership(familyId,actor);const entries=await this.repo.query('SELECT id,event_type,status,attempts,created_at,completed_at FROM entry_flows WHERE family_id=$1 AND actor_id=$2 ORDER BY created_at DESC LIMIT 100',[familyId,actor]);return entries.map(e=>({id:e.id,type:e.event_type,status:e.status,attempts:e.attempts,createdAt:e.created_at,completedAt:e.completed_at}));}
}
