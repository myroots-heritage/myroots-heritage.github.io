import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes,randomUUID } from 'node:crypto';
import { newDb, DataType } from 'pg-mem';
import { Pool } from 'pg';
import { PostgresRepository } from './repository.js';
import { ContactCipher } from './security.js';
import { AuthService } from './auth-service.js';
import { FamilyService } from './family-service.js';
import { EntryFlowService } from './entry-flows.js';
import { createApp } from './app.js';

async function setup(){
  const db=newDb();
  db.public.registerFunction({name:'length',args:[DataType.text],returns:DataType.integer,implementation:(value:string)=>[...value].length});
  for(const file of ['001_initial.sql','002_entry_flows.sql'])db.public.none(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  const Adapter=db.adapters.createPg();const pool=new Adapter.Pool() as unknown as Pool;
  const repo=new PostgresRepository(pool),cipher=new ContactCipher(randomBytes(32).toString('base64')),flows=new EntryFlowService(cipher);
  const auth=new AuthService(repo,flows),families=new FamilyService(repo,cipher,flows);
  const app=await createApp(auth,families,'http://127.0.0.1:5173');
  return {app,repo,auth,families,cipher,pool};
}
const origin={origin:'http://127.0.0.1:5173'};
test('API registration, tenant boundaries, privacy, messaging, and atomic entry-event creation',async(t)=>{
  const {app,repo,auth,families,cipher,pool}=await setup();t.after(async()=>{await app.close();await pool.end();});
  const registered=await app.inject({method:'POST',url:'/api/auth/register',headers:origin,payload:{name:'Test Family',email:'test@example.com',password:'correct horse battery staple'}});assert.equal(registered.statusCode,200,registered.body);
  const familyId=registered.json().familyId,cookie=registered.cookies[0].value,headers={...origin,cookie:`roots_session=${cookie}`};
  const actor=await auth.authenticate(cookie),family=await families.get(familyId,actor);
  await t.test('new members and self are unverified',()=>assert.equal(family.members[0].status,'unverified'));
  await t.test('anonymous tree access is denied',async()=>assert.equal((await app.inject(`/api/families/${familyId}`)).statusCode,401));
  await t.test('forged cross-family access is denied',async()=>assert.equal((await app.inject({url:`/api/families/${randomUUID()}`,headers})).statusCode,403));
  await t.test('untrusted browser origin cannot write',async()=>assert.equal((await app.inject({method:'POST',url:'/api/families/'+familyId+'/messages',headers:{...headers,origin:'https://evil.example'},payload:{text:'no'}})).statusCode,403));
  let parentId='';
  await t.test('member creation stores encrypted owner-only contact and queues encrypted workflow',async()=>{
    const res=await app.inject({method:'POST',url:`/api/families/${familyId}/members`,headers,payload:{name:'Private Parent',relativeTo:family.selfId,relation:'parent',phone:'+919876543210',city:'Private city'}});assert.equal(res.statusCode,201,res.body);parentId=res.json().id;
    const [contact]=await repo.query('SELECT * FROM private_contacts');assert.ok(!contact.ciphertext.includes('9876543210'));
    assert.equal((await families.get(familyId,actor)).members.find(m=>m.id===parentId)?.phone,'+919876543210');
    const events=await repo.query('SELECT * FROM entry_flows');assert.equal(events.length,2);const event=events.find(e=>e.event_type==='member.created')!;assert.ok(!event.encrypted_payload.includes('Private Parent'));assert.equal(JSON.parse(cipher.decrypt(event.encrypted_payload)).data.name,'Private Parent');
  });
  const other=await auth.register('Other Person','other@example.com','another long password'),otherActor=await auth.authenticate(other.token),otherMember=randomUUID();
  await repo.query('INSERT INTO members(id,family_id,name,created_by,account_id) VALUES($1,$2,$3,$4,$4)',[otherMember,familyId,'Other Person',otherActor]);
  await repo.query('INSERT INTO memberships(family_id,account_id,member_id) VALUES($1,$2,$3)',[familyId,otherActor,otherMember]);
  await t.test('another family member cannot read the creator’s phone or private profile',async()=>{const otherView=await families.get(familyId,otherActor);assert.equal(otherView.members.find(m=>m.id===parentId)?.phone,undefined);assert.equal(otherView.members.find(m=>m.id===parentId)?.profile?.city,undefined);});
  await t.test('field-level sharing reveals only granted fields and supports branch restrictions',async()=>{
    await families.updateProfile(familyId,actor,{city:'Bengaluru',email:'private@example.com',dob:'',religion:'',caste:'',gotra:''});
    await families.updateSharing(familyId,actor,[{field:'city',visibility:'family'}]);let view=await families.get(familyId,otherActor);assert.equal(view.members.find(m=>m.id===family.selfId)?.profile?.city,'Bengaluru');assert.equal(view.members.find(m=>m.id===family.selfId)?.profile?.email,undefined);
    await families.updateSharing(familyId,actor,[{field:'city',visibility:'branch',branchRootId:parentId}]);view=await families.get(familyId,otherActor);assert.equal(view.members.find(m=>m.id===family.selfId)?.profile?.city,undefined);
  });
  await t.test('messages and gatherings each create separate pending entry flows',async()=>{
    const before=(await repo.query('SELECT * FROM entry_flows')).length;
    assert.equal((await app.inject({method:'POST',url:`/api/families/${familyId}/messages`,headers,payload:{text:'Hello family'}})).statusCode,201);
    assert.equal((await app.inject({method:'POST',url:`/api/families/${familyId}/gatherings`,headers,payload:{title:'Lunch',date:'2027-01-01T10:00:00.000Z',location:'Home',description:''}})).statusCode,201);
    assert.equal((await repo.query('SELECT * FROM entry_flows')).length,before+2);
    assert.equal((await app.inject({url:`/api/families/${familyId}/messages`,headers})).json()[0].text,'Hello family');
  });
  await t.test('verification cannot claim delivery without a provider',async()=>{const res=await app.inject({method:'POST',url:`/api/families/${familyId}/verification`,headers});assert.equal(res.statusCode,501);assert.match(res.json().error,/No message has been sent/);});
  await t.test('flow list does not expose encrypted payloads, actor IDs, or contacts',async()=>{const res=await app.inject({url:`/api/families/${familyId}/flows`,headers});assert.equal(res.statusCode,200);assert.ok(!res.body.includes('encrypted_payload'));assert.ok(!res.body.includes('9876543210'));});
  await t.test('logout revokes the session',async()=>{await app.inject({method:'POST',url:'/api/auth/logout',headers});assert.equal((await app.inject({url:`/api/families/${familyId}`,headers})).statusCode,401);});
});
