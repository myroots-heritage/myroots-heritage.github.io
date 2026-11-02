import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { memberInputSchema, profileSchema, profileFields } from '@myroots/shared';
import { AuthService } from './auth-service.js';
import { FamilyService } from './family-service.js';
import { HttpError } from './security.js';
export async function createApp(auth:AuthService,families:FamilyService,origin:string,production=false){
  const app=Fastify({logger:{redact:['req.headers.cookie','req.headers.authorization','res.headers.set-cookie']},bodyLimit:32_768});
  await app.register(cookie);await app.register(cors,{origin,credentials:true});await app.register(helmet);await app.register(rateLimit,{max:120,timeWindow:'1 minute'});
  app.addHook('onRequest',async(req,reply)=>{
    reply.header('Cache-Control','no-store');
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin!==origin)throw new HttpError(403,'Request origin is not allowed');
  });
  app.setErrorHandler((error,req,reply)=>{if(error instanceof z.ZodError)return reply.code(400).send({error:error.issues[0]?.message??'Invalid input'});if(error instanceof HttpError)return reply.code(error.statusCode).send({error:error.message});const e=error as Error&{statusCode?:number};if(!e.statusCode||e.statusCode>=500)req.log.error({err:e},'Request failed');return reply.code(e.statusCode??500).send({error:e.statusCode&&e.statusCode<500?e.message:'Something went wrong. Please try again.'});});
  app.get('/api/health',async()=>({status:'ok'}));
  const credentials=z.object({email:z.email().max(254),password:z.string().min(12).max(128)});
  for(const mode of ['register','login'] as const)app.post(`/api/auth/${mode}`,{config:{rateLimit:{max:8,timeWindow:'15 minutes'}}},async(req,reply)=>{
    const body=credentials.extend({name:z.string().trim().min(1).max(100).optional()}).parse(req.body);
    if(mode==='register'&&!body.name)throw new HttpError(400,'Enter your name');
    const session=mode==='register'?await auth.register(body.name!,body.email,body.password):await auth.login(body.email,body.password);
    reply.setCookie('roots_session',session.token,{httpOnly:true,secure:production,sameSite:'strict',path:'/',maxAge:604800});return {familyId:session.familyId};
  });
  app.post('/api/auth/logout',async(req,reply)=>{await auth.logout(req.cookies.roots_session);reply.clearCookie('roots_session',{path:'/'});return {ok:true};});
  const params=z.object({familyId:z.uuid()});
  const context=async(req:{params:unknown;cookies:Record<string,string|undefined>})=>({familyId:params.parse(req.params).familyId,actor:await auth.authenticate(req.cookies.roots_session)});
  app.get('/api/families/:familyId',async(req)=>{const {familyId,actor}=await context(req);return families.get(familyId,actor);});
  app.post('/api/families/:familyId/members',async(req,reply)=>{const {familyId,actor}=await context(req);reply.code(201);return families.add(familyId,actor,memberInputSchema.parse(req.body));});
  app.put('/api/families/:familyId/profile',async(req)=>{const {familyId,actor}=await context(req);const {phone,...profile}=profileSchema.extend({phone:memberInputSchema.shape.phone.optional()}).parse(req.body);await families.updateProfile(familyId,actor,profile,phone);return {ok:true};});
  app.put('/api/families/:familyId/sharing',async(req)=>{const {familyId,actor}=await context(req);const rules=z.array(z.object({field:z.enum(profileFields),visibility:z.enum(['private','family','branch']),branchRootId:z.uuid().optional()}).refine(v=>v.visibility!=='branch'||!!v.branchRootId,'Choose a branch')).max(6).parse(req.body);await families.updateSharing(familyId,actor,rules);return {ok:true};});
  app.get('/api/families/:familyId/messages',async(req)=>{const {familyId,actor}=await context(req);return families.messages(familyId,actor);});
  app.post('/api/families/:familyId/messages',async(req,reply)=>{const {familyId,actor}=await context(req);await families.send(familyId,actor,z.object({text:z.string().trim().min(1).max(2000)}).parse(req.body).text);reply.code(201);return {ok:true};});
  app.get('/api/families/:familyId/gatherings',async(req)=>{const {familyId,actor}=await context(req);return families.gatherings(familyId,actor);});
  app.get('/api/families/:familyId/flows',async(req)=>{const {familyId,actor}=await context(req);return families.entryFlows(familyId,actor);});
  app.post('/api/families/:familyId/gatherings',async(req,reply)=>{const {familyId,actor}=await context(req);await families.plan(familyId,actor,z.object({title:z.string().trim().min(1).max(120),date:z.iso.datetime(),location:z.string().trim().min(1).max(200),description:z.string().trim().max(1000)}).parse(req.body));reply.code(201);return {ok:true};});
  app.post('/api/families/:familyId/verification',async(req)=>{const {familyId,actor}=await context(req);await families.membership(familyId,actor);throw new HttpError(501,'Verification delivery is not configured. No message has been sent.');});
  return app;
}
