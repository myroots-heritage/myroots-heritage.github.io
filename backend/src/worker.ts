import { Pool } from 'pg';
import { PostgresRepository } from './repository.js';
import { GoogleDriveStorage, EntryFlowWorker } from './entry-flows.js';
const required=['DATABASE_URL','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REFRESH_TOKEN','GOOGLE_DRIVE_FOLDER_ID'] as const;
for(const name of required)if(!process.env[name])throw new Error(`Set ${name} before starting entry flows`);
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2});
const storage=new GoogleDriveStorage({clientId:process.env.GOOGLE_CLIENT_ID!,clientSecret:process.env.GOOGLE_CLIENT_SECRET!,refreshToken:process.env.GOOGLE_REFRESH_TOKEN!,folderId:process.env.GOOGLE_DRIVE_FOLDER_ID!});
const worker=new EntryFlowWorker(new PostgresRepository(pool),storage);
let stopping=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;});
try{await storage.verifyFolder();do{let processed=0;while(!stopping&&processed<50&&await worker.processOne())processed++;if(process.argv.includes('--once'))break;if(!stopping)await new Promise(r=>setTimeout(r,3000));}while(!stopping);}finally{await pool.end();}
