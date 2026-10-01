import {test,expect} from 'bun:test';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {__testing} from './v0_32_2';
import {upsertFactRow,parseFactsFence} from '../../core/facts-fence';

const input={claim:'Test fact',kind:'fact' as const,confidence:1,visibility:'private' as const,notability:'medium' as const,validFrom:'2026-10-01',source:'test'};
for (const scenario of ['fresh duplicates','partial claimed row','unclaimed row after crash']) {
 test(scenario,async()=>{
  const root=mkdtempSync(join(tmpdir(),'gbrain-fence-test-'));
  try {
   mkdirSync(join(root,'people'));
   const path=join(root,'people/test.md');
   let body='---\ntype: person\ntitle: Test\n---\n\n# Test\n';
   if(scenario!=='fresh duplicates') body=upsertFactRow(body,input).body;
   writeFileSync(path,body);
   const claimed=scenario==='partial claimed row'?[{row_num:1}]:[];
   const updates:number[]=[];
   let pending=true;
   const row={source_id:'agent',entity_slug:'people/test',fact:input.claim,kind:input.kind,visibility:input.visibility,notability:input.notability,context:null,valid_from:new Date(input.validFrom),valid_until:null,source:'test',confidence:1};
   const engine={executeRaw:async(sql:string,params:any[]=[])=>{
    if(sql.includes('SELECT id, local_path')) return [{id:'agent',local_path:root}];
    if(sql.includes('SELECT id, source_id')) return pending?[{...row,id:'1'},{...row,id:'2'}]:[];
    if(sql.includes('SELECT row_num')) return claimed;
    if(sql.includes('UPDATE facts')) {expect(claimed.some(x=>x.row_num===params[0])).toBe(false);claimed.push({row_num:params[0]});updates.push(params[0]);return [];}
    throw Error(sql);
   }};
   expect((await __testing.phaseBFenceFacts(engine as any,{dryRun:false} as any)).status).toBe('complete');
   expect(new Set(updates).size).toBe(2);
   expect(parseFactsFence(readFileSync(path,'utf8')).facts.length).toBe(scenario==='partial claimed row'?3:2);
   pending=false;
   const before=readFileSync(path,'utf8');
   expect((await __testing.phaseBFenceFacts(engine as any,{dryRun:false} as any)).status).toBe('complete');
   expect(readFileSync(path,'utf8')).toBe(before);
  }finally{rmSync(root,{recursive:true,force:true});}
 });
}
