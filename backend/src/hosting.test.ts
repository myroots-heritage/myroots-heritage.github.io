import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { hostingConfig, serveFrontend } from './hosting.js';

test('hosting keeps development local and uses Render’s public origin and assigned port in production',()=>{
  assert.deepEqual(hostingConfig({}),{production:false,origin:'http://127.0.0.1:5173',port:3001,host:'127.0.0.1',serveFrontend:false});
  const config=hostingConfig({NODE_ENV:'production',RENDER_EXTERNAL_URL:'https://myroots-test.onrender.com',PORT:'10000',SERVE_FRONTEND:'true'});
  assert.equal(config.origin,'https://myroots-test.onrender.com');assert.equal(config.host,'0.0.0.0');assert.equal(config.port,10000);assert.equal(config.serveFrontend,true);
  assert.equal(hostingConfig({NODE_ENV:'production',RENDER_EXTERNAL_URL:'https://render.example',WEB_ORIGIN:'https://family.example/'}).origin,'https://family.example');
});
test('production refuses missing or unsafe origins and invalid ports',()=>{
  assert.throws(()=>hostingConfig({NODE_ENV:'production'}),/WEB_ORIGIN/);
  for(const origin of ['http://example.com','https://example.com/path','https://user:password@example.com','https://example.com?token=secret'])assert.throws(()=>hostingConfig({NODE_ENV:'production',WEB_ORIGIN:origin}));
  for(const port of ['0','65536','abc'])assert.throws(()=>hostingConfig({PORT:port}),/PORT/);
});
test('combined host serves HTML and assets without swallowing API 404s or exposing private files',async(t)=>{
  const temp=await mkdtemp(join(tmpdir(),'myroots-hosting-'));const root=join(temp,'public');await mkdir(join(root,'assets'),{recursive:true});
  await writeFile(join(root,'index.html'),'<!doctype html><title>my.roots</title>');await writeFile(join(root,'assets','app.js'),'console.log("my.roots")');await writeFile(join(root,'.env'),'SECRET=hidden');await writeFile(join(temp,'private.txt'),'not-public');
  const app=Fastify();app.get('/api/health',async()=>({status:'ok'}));await serveFrontend(app,root);
  t.after(async()=>{await app.close();await rm(temp,{recursive:true,force:true});});
  const html=await app.inject('/');assert.equal(html.statusCode,200,html.body);assert.match(html.body,/my.roots/);assert.equal(html.headers['cache-control'],'no-store');
  assert.equal((await app.inject('/assets/app.js')).statusCode,200);assert.deepEqual((await app.inject('/api/health')).json(),{status:'ok'});
  assert.equal((await app.inject('/api/missing')).statusCode,404);assert.ok((await app.inject('/.env')).statusCode>=400);assert.ok((await app.inject('/%2e%2e/private.txt')).statusCode>=400);
});
