import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt=promisify(scryptCb);
export class PasswordHasher {
  async hash(password:string){const salt=randomBytes(16).toString('hex'); const key=await scrypt(password,salt,64) as Buffer;return `${salt}:${key.toString('hex')}`;}
  async verify(password:string,hash:string){const [salt,stored]=hash.split(':');const actual=await scrypt(password,salt,64) as Buffer;const expected=Buffer.from(stored,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}
}
export class ContactCipher {
  private key:Buffer;
  constructor(key:string){this.key=Buffer.from(key,'base64');if(this.key.length!==32)throw new Error('CONTACT_ENCRYPTION_KEY must be 32 random bytes encoded as base64');}
  encrypt(value:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),ciphertext].map(b=>b.toString('base64')).join('.');}
  decrypt(value:string){const [iv,tag,data]=value.split('.').map(v=>Buffer.from(v,'base64'));const decipher=createDecipheriv('aes-256-gcm',this.key,iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');}
}
export const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export class HttpError extends Error {constructor(public statusCode:number,message:string){super(message);}}
