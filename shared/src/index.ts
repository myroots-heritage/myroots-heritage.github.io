import { z } from 'zod';

export const profileFields = ['dob', 'city', 'email', 'religion', 'caste', 'gotra'] as const;
export type ProfileField = typeof profileFields[number];
export const profileSchema = z.object({
  dob: z.string().max(10).refine(v => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v && v <= new Date().toISOString().slice(0,10)), 'Enter a past date').default(''),
  city: z.string().trim().max(100).default(''), email: z.union([z.email(), z.literal('')]).default(''),
  religion: z.string().trim().max(60).default(''), caste: z.string().trim().max(80).default(''), gotra: z.string().trim().max(80).default('')
});
export type Profile = z.infer<typeof profileSchema>;
export type Visibility = 'private' | 'family' | 'branch';
export interface Sharing { field: ProfileField; visibility: Visibility; branchRootId?: string }
export interface Member {
  id: string; familyId: string; name: string; createdBy?: string; accountId?: string;
  status: 'unverified' | 'verified'; city?: string; phone?: string; profile?: Partial<Profile>;
}
export interface Relationship { id: string; familyId: string; fromId: string; toId: string; type: 'parent' | 'partner' }
export interface Family { id: string; name: string; members: Member[]; relationships: Relationship[]; selfId: string; sharing: Sharing[] }
export interface Message { id: string; familyId: string; authorId: string; authorName: string; text: string; createdAt: string }
export interface Gathering { id: string; familyId: string; title: string; date: string; location: string; description: string; createdBy: string }
export interface EntryFlow { id:string; type:string; status:'pending'|'processing'|'completed'|'dead'; attempts:number; createdAt:string; completedAt?:string }
export const memberInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.union([z.string().regex(/^\+[1-9]\d{7,14}$/, 'Use international format, e.g. +919876543210'), z.literal('')]).default(''),
  relativeTo: z.uuid(), relation: z.enum(['parent','child','sibling','partner']),
  city: z.string().trim().max(100).default('')
});
export type MemberInput = z.infer<typeof memberInputSchema>;

/** Indexed adjacency lists: O(V+E) memory and traversal; multiple parents supported. */
export class FamilyGraph {
  private adjacency = new Map<string, { id: string; label: string }[]>();
  private children = new Map<string, string[]>();
  constructor(readonly members: Member[], readonly edges: Relationship[]) {
    for (const m of members) this.adjacency.set(m.id, []);
    for (const e of edges) {
      this.adjacency.get(e.fromId)?.push({id:e.toId,label:e.type==='parent'?'child':'partner'});
      this.adjacency.get(e.toId)?.push({id:e.fromId,label:e.type==='parent'?'parent':'partner'});
      if(e.type==='parent'){let children=this.children.get(e.fromId);if(!children){children=[];this.children.set(e.fromId,children);}children.push(e.toId);}
    }
  }
  descendants(root: string): Set<string> {
    const found=new Set<string>(); const queue=[root];
    for(let i=0;i<queue.length;i++){const id=queue[i]; if(found.has(id))continue;found.add(id);queue.push(...(this.children.get(id)??[]));}
    return found;
  }
  path(from: string,to: string): {id:string;label:string}[] {
    const queue=[from], previous=new Map<string,{id:string;label:string}>(); const visited=new Set([from]);
    for(let i=0;i<queue.length;i++){const current=queue[i];if(current===to){const path=[];let at=to;while(at!==from){const step=previous.get(at)!;path.push({id:at,label:step.label});at=step.id;}return path.reverse();}
      for(const next of this.adjacency.get(current)??[]){if(!visited.has(next.id)){visited.add(next.id);previous.set(next.id,{id:current,label:next.label});queue.push(next.id);}}}
    return [];
  }
  wouldCycle(parent: string,child: string){return this.descendants(child).has(parent);}
}
