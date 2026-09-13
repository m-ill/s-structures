import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getKcscRuleSources} from '../src/metadata/kcscRuleSources.js';

const folder=new URL('../verification/evidence/phase24/kcsc/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('retrieval-manifest.json',folder),'utf8'));
assert.equal(manifest.credentialStored,false);
assert.equal(manifest.records.length,9);
const sources=getKcscRuleSources(manifest.records.map(x=>x.code));
assert.equal(sources.length,9);
for(const record of manifest.records) {
 const data=readFileSync(new URL(record.file,folder)),doc=JSON.parse(data)[0];
 const source=sources.find(x=>x.id===record.code);
 assert.equal(createHash('sha256').update(data).digest('hex'),record.sha256);
 assert.equal(data.length,record.bytes);
 assert.equal(source.sha256,record.sha256);
 assert.equal(source.edition,doc.version);
 assert.equal(source.updateDate,doc.updateDate);
 assert.equal(source.url,`https://kcsc.re.kr/OpenApi/CodeViewer/KDS/${record.code}`);
 assert.equal(source.verification,'official-source-captured-independent-review-pending');
}
console.log('PASS nine official document hashes, individual editions, credential-free module metadata');
