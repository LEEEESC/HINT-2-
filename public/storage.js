const STATUSES=['관심공고','서류작성중','서류완료','지원완료','서류합격','최종합격'];
const DOMAINS={'saramin.co.kr':'사람인','jobkorea.co.kr':'잡코리아','jasoseol.com':'자소설닷컴','incruit.com':'인크루트','incruit.co.kr':'인크루트','dmand.co.kr':'디맨드'};
const MAX=5*1024*1024;
export function normalizeURL(value){
  if(typeof value!=='string'||value.length>2000)throw new Error('공고 URL을 확인해 주세요.');
  const u=new URL(value.trim());const domain=Object.keys(DOMAINS).find(d=>u.hostname===d||u.hostname.endsWith('.'+d));
  if(u.protocol!=='https:'||u.username||u.password||u.port||!domain)throw new Error('지원하는 채용 사이트의 HTTPS 주소를 입력해 주세요.');
  u.hash='';return {url:u.href,platform:DOMAINS[domain]};
}
function validDate(value){if(!value)return '';const date=new Date(value+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||+value.slice(0,4)<1900||isNaN(date)||date.toISOString().slice(0,10)!==value)throw new Error('마감 일자를 확인해 주세요.');return value;}
function validateFile(file){
 if(!file)return null;
 if(typeof file.name!=='string'||!/^.{1,200}\.(pdf|docx?|hwpx?|txt)$/i.test(file.name)||typeof file.base64!=='string'||!file.base64||file.base64.length>Math.ceil(MAX/3)*4||file.base64.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64))throw new Error('지원하는 5MB 이하 문서 파일을 선택해 주세요.');
 const bytes=file.base64.length*3/4-(file.base64.endsWith('==')?2:file.base64.endsWith('=')?1:0);if(bytes>MAX)throw new Error('첨부파일은 5MB 이하여야 합니다.');
 return {name:file.name.replace(/[\/\\\x00-\x1f]/g,'_'),base64:file.base64};
}
function short(value,max){if(typeof value!=='string'||value.length>max)throw new Error('입력 길이나 형식을 확인해 주세요.');return value.trim();}
function publicJob(j){const {file,...record}=j;return {...record,fileName:file?.name||'',fileUrl:''};}
// 저장과 삭제는 하나의 IndexedDB 트랜잭션으로 처리합니다.
export function createService(store,importer){
 return async function api(name,arg){
  if(name==='getFormOptions'){await store.all();return {statuses:STATUSES,maxBytes:MAX};}
  if(name==='importJob'){
   const info=normalizeURL(arg);const previous=(await store.all()).find(j=>j.url===info.url);
   if(previous)return {...publicJob(previous),warning:previous.trashed?'이 공고는 휴지통에 있습니다. 복원해 주세요.':'이미 저장된 공고입니다. 기존 수정 내용을 유지했습니다.'};
   let metadata;
   try{metadata=await importer(info.url);}catch(e){metadata={...info,company:'',title:'',role:'',deadline:'',warning:'자동 수집이 불가능합니다. URL은 저장되며 공고 정보를 직접 보완할 수 있습니다.'};}
   const result=await store.mutate(records=>{
    const existing=records.find(j=>j.url===info.url);if(existing)return existing;
    const j={id:crypto.randomUUID(),...info,company:String(metadata.company||'').slice(0,200),title:String(metadata.title||'').slice(0,300),role:String(metadata.role||'').slice(0,200),deadline:validDate(metadata.deadline||''),status:STATUSES[0],file:null,trashed:false,deletedAt:'',createdAt:new Date().toISOString(),requestId:''};records.push(j);return j;
   });return {...publicJob(result),warning:result.trashed?'이 공고는 휴지통에 있습니다. 복원해 주세요.':metadata.warning||'공고 정보를 원문과 확인해 주세요.'};
  }
  if(name==='listJobs'){
   const all=await store.all(),query=arg||{};const rows=all.filter(j=>j.trashed===(query.view==='trash')).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
   const offset=Math.max(0,Math.floor(Number(query.offset)||0));return {jobs:rows.slice(offset,offset+50).map(publicJob),next:offset+50<rows.length?offset+50:null,activeCount:all.filter(j=>!j.trashed).length,trashCount:all.filter(j=>j.trashed).length};
  }
  if(name==='saveJob'){
   const info=normalizeURL(arg.url);const company=short(arg.company,200),title=short(arg.title,300),role=short(arg.role,200),deadline=validDate(arg.deadline);
   if(!company||!title||!role||!STATUSES.includes(arg.status))throw new Error('기업명, 공고명, 지원 직무와 지원 상태를 확인해 주세요.');
   const file=validateFile(arg.file);
   const j=await store.mutate(rows=>{
    const j=rows.find(j=>j.id===arg.id);if(!j||j.trashed)throw new Error('공고를 찾을 수 없거나 휴지통에 있습니다.');if(j.url!==info.url)throw new Error('공고 주소가 변경되었습니다.');
    if(j.requestId===arg.requestId&&arg.requestId)return j;
    Object.assign(j,{company,title,role,deadline,status:arg.status,requestId:arg.requestId||''});if(file)j.file=file;return j;
   });return {message:'변경 내용과 첨부파일을 이 기기에 저장했습니다.',job:publicJob(j)};
  }
  if(name==='changeJobState'){
   if(!['trash','restore','delete'].includes(arg.action))throw new Error('잘못된 요청입니다.');
   await store.mutate(rows=>{const i=rows.findIndex(j=>j.id===arg.id);if(i<0){if(arg.action==='delete')return;throw new Error('공고를 찾을 수 없습니다.');}const j=rows[i];
    if(arg.action==='delete'){if(!j.trashed)throw new Error('휴지통에 있는 공고만 영구 삭제할 수 있습니다.');rows.splice(i,1);}
    else{j.trashed=arg.action==='trash';j.deletedAt=j.trashed?j.deletedAt||new Date().toISOString():'';}
   });return {message:arg.action==='trash'?'휴지통으로 이동했습니다.':arg.action==='restore'?'공고를 복원했습니다.':'공고와 첨부파일을 영구 삭제했습니다.'};
  }
  throw new Error('지원하지 않는 요청입니다.');
 };
}
let dbPromise;
function db(){
 if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB){reject(new Error('이 브라우저에서 기기 저장을 사용할 수 없습니다. 일반 브라우저로 열어 주세요.'));return;}
  const r=indexedDB.open('hint-job-hub',1);r.onupgradeneeded=()=>{const s=r.result.createObjectStore('jobs',{keyPath:'id'});s.createIndex('url','url',{unique:true});};r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();dbPromise=null;};resolve(r.result);};r.onerror=()=>{dbPromise=null;reject(r.error);};r.onblocked=()=>reject(new Error('다른 탭을 닫고 다시 열어 주세요.'));
 });return dbPromise;
}
const store={
 async all(){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('jobs','readonly'),r=tx.objectStore('jobs').getAll();tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);});},
 async mutate(fn){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('jobs','readwrite'),s=tx.objectStore('jobs'),r=s.getAll();let result,ownError;
  r.onsuccess=()=>{try{const before=r.result,rows=structuredClone(before);result=fn(rows);const ids=new Set(rows.map(j=>j.id));for(const j of before)if(!ids.has(j.id))s.delete(j.id);for(const j of rows)s.put(j);}catch(e){ownError=e;tx.abort();}};
  tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(ownError||new Error(tx.error?.name==='QuotaExceededError'?'기기 저장 공간이 부족합니다. 백업 후 불필요한 첨부파일을 정리해 주세요.':'저장에 실패했습니다. 다시 시도해 주세요.'));
 });}
};
const api=createService(store,async url=>{
 const response=await fetch('/api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw new Error('공고 불러오기 실패');const data=await response.json();if(data.error)throw new Error(data.error);return data;
});
const urls=new Map();
async function hydrate(job){
 if(!job?.fileName)return job;
 const row=(await store.all()).find(j=>j.id===job.id);if(!row?.file)return job;
 const signature=row.file.base64;let entry=urls.get(job.id);
 if(!entry||entry.signature!==signature){if(entry)URL.revokeObjectURL(entry.url);const bytes=Uint8Array.from(atob(signature),c=>c.charCodeAt(0));const ext=row.file.name.split('.').pop().toLowerCase();const types={pdf:'application/pdf',txt:'text/plain',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',hwp:'application/x-hwp',hwpx:'application/vnd.hancom.hwpx'};entry={signature,url:URL.createObjectURL(new Blob([bytes],{type:types[ext]}))};urls.set(job.id,entry);}
 return {...job,fileUrl:entry.url};
}
export async function localAPI(name,arg){
 const result=await api(name,arg);
 if(name==='listJobs')result.jobs=await Promise.all(result.jobs.map(hydrate));
 if(name==='importJob')return hydrate(result);
 if(name==='saveJob')result.job=await hydrate(result.job);
 if(name==='changeJobState'&&urls.has(arg.id)){URL.revokeObjectURL(urls.get(arg.id).url);urls.delete(arg.id);}
 return result;
}
export async function exportBackup(){
 const data=JSON.stringify({app:'hint-job-hub',version:1,exportedAt:new Date().toISOString(),jobs:await store.all()});const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='Job_Hub_Backup_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
export async function importBackup(file){
 if(file.size>100*1024*1024)throw new Error('백업은 100MB 이하여야 합니다.');const backup=JSON.parse(await file.text());
 if(backup.app!=='hint-job-hub'||backup.version!==1||!Array.isArray(backup.jobs)||backup.jobs.length>5000)throw new Error('이 앱에서 만든 백업 파일을 선택해 주세요.');
 const rows=backup.jobs.map(j=>({id:crypto.randomUUID(),...normalizeURL(j.url),company:short(j.company,200),title:short(j.title,300),role:short(j.role,200),deadline:validDate(j.deadline),status:STATUSES.includes(j.status)?j.status:STATUSES[0],file:validateFile(j.file),trashed:!!j.trashed,deletedAt:typeof j.deletedAt==='string'?j.deletedAt.slice(0,30):'',createdAt:typeof j.createdAt==='string'?j.createdAt.slice(0,30):new Date().toISOString(),requestId:''}));
 return store.mutate(existing=>{let n=0;for(const j of rows)if(!existing.some(x=>x.url===j.url)){existing.push(j);n++;}return n;});
}
