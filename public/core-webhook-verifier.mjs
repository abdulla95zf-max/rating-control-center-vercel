// Node.js SERVER ONLY. Raw request bytes must be verified BEFORE JSON parsing.
// Keep the production webhook secret in Core's private server environment.
import {createHmac,timingSafeEqual} from 'node:crypto';
export function verifyRccWebhook(rawBody,timestamp,signature,secret,now=Math.floor(Date.now()/1000)){
 if(!Buffer.isBuffer(rawBody)||rawBody.length>2000000||typeof secret!=='string'||secret.length<43||secret.length>512||typeof timestamp!=='string'||!/^\d{10}$/.test(timestamp)||Math.abs(now-Number(timestamp))>300||typeof signature!=='string'||!/^v1=[a-f0-9]{64}$/.test(signature))return false;
 const expected='v1='+createHmac('sha256',secret).update(timestamp+'.').update(rawBody).digest('hex');
 return timingSafeEqual(Buffer.from(expected),Buffer.from(signature));
}
// After verification: validate schema/type/IDs and persist eventId+sequence in
// the SAME durable transaction as Firebase writes. Return success only after
// persistence. Reject older sequences. A duplicate saved event is acknowledged
// without replaying writes. Never log signatures, raw bodies or secrets.
