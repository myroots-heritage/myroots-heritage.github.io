import { Pool, type PoolClient, type QueryResultRow } from 'pg';
/** All SQL stays in the persistence layer. Parameterized queries only. */
export class PostgresRepository {
  constructor(private db:Pool|PoolClient){}
  async query<T extends QueryResultRow=QueryResultRow>(sql:string,values:unknown[]=[]){return (await this.db.query<T>(sql,values)).rows;}
  async transaction<T>(operation:(repository:PostgresRepository)=>Promise<T>):Promise<T>{
    if('release' in this.db)return operation(this);
    const client=await (this.db as Pool).connect();try{await client.query('BEGIN');const result=await operation(new PostgresRepository(client));await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
}
