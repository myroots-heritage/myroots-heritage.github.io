import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

export function hostingConfig(env:NodeJS.ProcessEnv){
  const production=env.NODE_ENV==='production';
  const configuredOrigin=env.WEB_ORIGIN||env.RENDER_EXTERNAL_URL||(production?'':'http://127.0.0.1:5173');
  if(!configuredOrigin)throw new Error('Set WEB_ORIGIN to the HTTPS website address');
  const originUrl=new URL(configuredOrigin);
  if(!['http:','https:'].includes(originUrl.protocol)||originUrl.username||originUrl.password||originUrl.pathname!=='/'||originUrl.search||originUrl.hash)throw new Error('WEB_ORIGIN must be a website origin without a path, credentials, or query');
  if(production&&originUrl.protocol!=='https:')throw new Error('WEB_ORIGIN must use HTTPS in production');
  const port=Number(env.PORT??3001);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be between 1 and 65535');
  return {production,origin:originUrl.origin,port,host:env.HOST||(production?'0.0.0.0':'127.0.0.1'),serveFrontend:env.SERVE_FRONTEND==='true'};
}

/** Serve only the built public folder, keeping API routes on the same origin. */
export async function serveFrontend(app:FastifyInstance,root=fileURLToPath(new URL('../../frontend/dist/',import.meta.url))){
  await access(join(root,'index.html')); // Fail clearly when the frontend wasn't built.
  await app.register(fastifyStatic,{root,dotfiles:'deny',setHeaders(response,path){
    if(path.endsWith('.html'))response.header('Cache-Control','no-store');
  }});
}
