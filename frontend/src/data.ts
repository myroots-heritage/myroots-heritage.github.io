import { FamilyGraph, memberInputSchema, profileSchema, type Family, type MemberInput, type Message, type Gathering, type Profile, type Sharing, type EntryFlow } from '@myroots/shared';
const uid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const sampleFamily:Family={id:uid(100),name:'The Sharma family',selfId:uid(7),sharing:[],members:[
  {id:uid(1),name:'Rajendra Sharma',city:'Jaipur',status:'verified'},
  {id:uid(2),name:'Savitri Sharma',city:'Jaipur',status:'verified'},
  {id:uid(3),name:'Mohan Mehta',city:'Delhi',status:'unverified'},
  {id:uid(4),name:'Kamla Mehta',city:'Delhi',status:'unverified'},
  {id:uid(5),name:'Vikram Sharma',city:'Jaipur',status:'verified'},
  {id:uid(6),name:'Sunita Sharma',city:'Jaipur',status:'verified'},
  {id:uid(7),name:'Ananya Sharma',city:'Bengaluru',status:'verified',profile:{city:'Bengaluru',religion:'',caste:'',gotra:'',dob:'',email:''}},
  {id:uid(8),name:'Arjun Sharma',city:'Pune',status:'unverified'},
  {id:uid(9),name:'Meera Sharma',city:'Mumbai',status:'verified'}
].map(m=>({...m,status:m.status as 'verified'|'unverified',familyId:uid(100),createdBy:'demo',accountId:m.id===uid(7)?'demo':undefined})),relationships:[
  ...[[1,5],[2,5],[3,6],[4,6],[5,7],[6,7],[5,8],[6,8],[5,9],[6,9]].map(([a,b],i)=>({id:uid(200+i),familyId:uid(100),fromId:uid(a),toId:uid(b),type:'parent' as const})),
  ...[[1,2],[3,4],[5,6]].map(([a,b],i)=>({id:uid(300+i),familyId:uid(100),fromId:uid(a),toId:uid(b),type:'partner' as const}))
]};
export interface RootsRepository {
  readonly demo:boolean; getFlows():Promise<EntryFlow[]>; getFamily():Promise<Family>; addMember(input:MemberInput):Promise<void>;
  saveProfile(profile:Profile,phone?:string):Promise<void>; saveSharing(sharing:Sharing[]):Promise<void>;
  getMessages():Promise<Message[]>; sendMessage(text:string):Promise<void>;
  getGatherings():Promise<Gathering[]>; planGathering(event:Omit<Gathering,'id'|'familyId'|'createdBy'>):Promise<void>;
}
/** Disposable, in-memory sandbox. No real contact data is seeded or persisted. */
export class DemoRepository implements RootsRepository {
  readonly demo=true;
  private family=structuredClone(sampleFamily);
  private messages:Message[]=[{id:'welcome',familyId:uid(100),authorId:uid(6),authorName:'Sunita Sharma',text:'A little place for all of us. Add your memories, say hello, and let’s stay a little closer. 🌿',createdAt:new Date().toISOString()}];
  private events:Gathering[]=[];
  private flows:EntryFlow[]=[];
  private record(type:string){this.flows.unshift({id:crypto.randomUUID(),type,status:'pending',attempts:0,createdAt:new Date().toISOString()});}
  async getFlows(){return structuredClone(this.flows);}
  async getFamily(){return structuredClone(this.family);}
  async addMember(raw:MemberInput){const input=memberInputSchema.parse(raw),id=crypto.randomUUID();
    const parents=this.family.relationships.filter(e=>e.type==='parent'&&e.toId===input.relativeTo);
    if(input.relation==='sibling'&&!parents.length)throw new Error('Add a parent first so we can connect this sibling.');
    this.family.members.push({id,familyId:this.family.id,name:input.name,createdBy:'demo',status:'unverified',phone:input.phone,city:input.city,profile:{city:input.city}});
    const add=(fromId:string,toId:string,type:'parent'|'partner')=>this.family.relationships.push({id:crypto.randomUUID(),familyId:this.family.id,fromId,toId,type});
    this.record('member.created');
    if(input.relation==='parent')add(id,input.relativeTo,'parent');if(input.relation==='child')add(input.relativeTo,id,'parent');if(input.relation==='partner')add(input.relativeTo,id,'partner');if(input.relation==='sibling')parents.forEach(e=>add(e.fromId,id,'parent'));
  }
  async saveProfile(profile:Profile,phone?:string){const validated=profileSchema.parse(profile);if(phone!==undefined)memberInputSchema.shape.phone.parse(phone);const self=this.family.members.find(m=>m.id===this.family.selfId)!;self.profile=validated;self.city=validated.city;if(phone!==undefined)self.phone=phone;this.record('profile.updated');}
  async saveSharing(sharing:Sharing[]){this.family.sharing=structuredClone(sharing);this.record('sharing.updated');}
  async getMessages(){return structuredClone(this.messages);}
  async sendMessage(text:string){this.record('message.created');this.messages.push({id:crypto.randomUUID(),familyId:this.family.id,authorId:this.family.selfId,authorName:this.family.members.find(m=>m.id===this.family.selfId)!.name,text,createdAt:new Date().toISOString()});}
  async getGatherings(){return structuredClone(this.events);}
  async planGathering(event:Omit<Gathering,'id'|'familyId'|'createdBy'>){this.record('gathering.created');this.events.push({...event,id:crypto.randomUUID(),familyId:this.family.id,createdBy:this.family.selfId});}
}
const apiBase=(import.meta.env.VITE_API_URL??'').replace(/\/$/,'');
export async function request<T>(path:string,method='GET',body?:unknown):Promise<T>{
  let response:Response;
  try{response=await fetch(`${apiBase}/api${path}`,{method,credentials:'include',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});}catch{throw new Error('The backend is unavailable. Start the API to use your own family space.');}
  const result=await response.json().catch(()=>{throw new Error('The backend is not connected. Start the API to sign in.');});
  if(!response.ok)throw new Error(result.error??'Request failed');return result as T;
}
export class ApiRepository implements RootsRepository {
  readonly demo=false;
  constructor(private familyId:string){}
  private path(suffix=''){return `/families/${this.familyId}${suffix}`;}
  getFamily(){return request<Family>(this.path());}
  getFlows(){return request<EntryFlow[]>(this.path('/flows'));}
  async addMember(input:MemberInput){await request(this.path('/members'),'POST',input);}
  async saveProfile(profile:Profile,phone?:string){await request(this.path('/profile'),'PUT',{...profile,phone});}
  async saveSharing(sharing:Sharing[]){await request(this.path('/sharing'),'PUT',sharing);}
  getMessages(){return request<Message[]>(this.path('/messages'));}
  async sendMessage(text:string){await request(this.path('/messages'),'POST',{text});}
  getGatherings(){return request<Gathering[]>(this.path('/gatherings'));}
  async planGathering(event:Omit<Gathering,'id'|'familyId'|'createdBy'>){await request(this.path('/gatherings'),'POST',event);}
}
export function relationLabel(family:Family,id:string){if(id===family.selfId)return 'You';const path=new FamilyGraph(family.members,family.relationships).path(family.selfId,id);const labels=path.map(p=>p.label);if(labels.join(',')==='parent,child')return 'Sibling';if(labels.join(',')==='parent,parent')return 'Grandparent';if(labels.length===1)return ({parent:'Parent',child:'Child',partner:'Partner'} as Record<string,string>)[labels[0]];return 'Family member';}
