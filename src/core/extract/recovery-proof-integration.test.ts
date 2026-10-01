import {test,expect} from 'bun:test';
import {PGLiteEngine} from '../pglite-engine.ts';
import {writeReceipt} from './receipt-writer.ts';
import {upsertExtractRollup} from './rollup-writer.ts';
import {computeExtractHealthCheck} from '../../commands/doctor.ts';

test('receipt proof survives no-op completion but a genuinely new halt warns',async()=>{
 const e=new PGLiteEngine();await e.connect({});await e.initSchema();
 try {
  await upsertExtractRollup(e,{kind:'facts.fence',source_id:'default',halt_delta:2,round_completed_delta:4});
  expect((await computeExtractHealthCheck(e)).status).toBe('warn');
  const r=await writeReceipt(e,{kind:'facts.fence',source_id:'default',run_id:'proofcase',round:'single',extracted_at:new Date(Date.now()-3600000).toISOString(),total_rows:5,cost_usd:0});
  expect(r.page.frontmatter.halt_snapshot).toBeDefined();
  await upsertExtractRollup(e,{kind:'facts.fence',source_id:'default',round_completed_delta:1});
  expect((await computeExtractHealthCheck(e)).status).toBe('ok');
  await upsertExtractRollup(e,{kind:'facts.fence',source_id:'default',halt_delta:1});
  expect((await computeExtractHealthCheck(e)).status).toBe('warn');
 }finally{await e.disconnect()}
});
