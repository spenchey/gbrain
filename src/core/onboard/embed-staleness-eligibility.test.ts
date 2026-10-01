import {test,expect} from 'bun:test';
import {PGlite} from '@electric-sql/pglite';
import {checkEmbedStaleness} from './checks';

test('doctor counts only live eligible chunks, without hiding real backlog',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE TABLE pages(id int PRIMARY KEY,deleted_at timestamp,frontmatter jsonb);
   CREATE TABLE content_chunks(page_id int,embedding text);
   INSERT INTO pages VALUES (1,NULL,'{}'),(2,NULL,'{"embed_skip":true}'),(3,NOW(),'{}'),(4,NULL,'{}');
   INSERT INTO content_chunks VALUES(1,NULL),(2,NULL),(3,NULL),(4,'vector');`);
  const engine={executeRaw:async(sql:string,params:any[]=[]) => (await db.query(sql,params)).rows};
  const before=await checkEmbedStaleness(engine as any);
  expect(before.check.status).toBe('warn');
  expect(before.check.message).toContain('1 stale chunks');
  await db.exec("UPDATE content_chunks SET embedding='vector' WHERE page_id=1");
  const after=await checkEmbedStaleness(engine as any);
  expect(after.check.status).toBe('ok');
  expect(after.check.message).toBe('No stale chunks');
 }finally{await db.close();}
});
