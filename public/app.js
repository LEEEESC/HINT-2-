import {localAPI, exportBackup, importBackup} from './storage.js';

const $ = id => document.getElementById(id);
let ready=false,busy=false,loadedUrl='',loadedId='',requestId='',next=null;
let view=location.hash==='#trash'?'trash':'active',listEpoch=0;
let selectedId='',shownJobs=new Map();
function message(t,error=false){$('message').textContent=t;$('message').className=error?'error':'';}
function controls(){
  $('importBtn').disabled=!ready||busy;
  $('fields').disabled=!ready||busy||!loadedId;
  $('searchUrl').disabled=busy;
  $('activeTab').disabled=!ready||busy;$('trashTab').disabled=!ready||busy;
  $('more').disabled=!ready||busy;
  document.querySelectorAll('[data-action]').forEach(b=>b.disabled=busy);
}
async function rpc(name,arg) { return localAPI(name,arg); }
function link(url,text){
  try{const u=new URL(url);if(!['https:','blob:'].includes(u.protocol)||u.username||u.password)return null;if(u.protocol==='blob:'&&new URL(u.pathname).origin!==location.origin)return null;
    const a=document.createElement('a');a.href=u.href;a.textContent=text;a.target='_blank';a.rel='noopener noreferrer';a.className='link secondary';return a;
  }catch(_){return null;}
}
function actionButton(text,handler,cls='secondary'){
  const b=document.createElement('button');b.type='button';b.textContent=text;b.className=cls;b.dataset.action='true';b.disabled=busy;b.addEventListener('click',handler);return b;
}
function dirty(){requestId='';}
function clearEditor(){loadedId='';loadedUrl='';requestId='';$('form').reset();$('source').hidden=true;$('warning').textContent='';$('currentFile').replaceChildren();controls();}
function clearDetail(){selectedId='';$('detail').replaceChildren();const h=document.createElement('h2');h.textContent='공고 상세';const p=document.createElement('p');p.textContent='기업명 버튼을 눌러 주세요.';$('detail').append(h,p);}
function fillEditor(j){
  if(j.trashed){clearEditor();return;}
  $('form').reset();loadedId=j.id;loadedUrl=j.url;requestId='';
  ['platform','company','title','role','deadline','status'].forEach(k=>$(k).value=j[k]||'');
  if(!$('status').value)$('status').selectedIndex=0;
  $('source').href=j.url;$('source').hidden=false;$('warning').textContent=j.warning||'';
  $('currentFile').replaceChildren();const a=link(j.fileUrl,j.fileName||'현재 첨부파일 열기');if(a)$('currentFile').appendChild(a);
  controls();
}
$('form').addEventListener('input',dirty);$('form').addEventListener('change',dirty);
$('searchUrl').addEventListener('input',()=>{clearEditor();$('warning').textContent='주소가 변경되었습니다. 공고를 다시 불러와 주세요.';});
$('searchUrl').addEventListener('paste',()=>setTimeout(()=>{if(ready&&!busy&&$('searchUrl').value.trim())$('importBtn').click();},0));
$('searchUrl').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('importBtn').click();}});
$('importBtn').addEventListener('click',async()=>{
  if(!ready||busy)return;
  busy=true;controls();message('공고 정보를 불러와 자동 저장하고 있습니다...');
  try{
    const j=await rpc('importJob',$('searchUrl').value.trim());
    if(j.trashed){clearEditor();message(j.warning);setView('trash',false);location.hash='trash';}
    else{fillEditor(j);message('저장한 공고에 반영했습니다. 누락 항목을 보완하거나 파일을 첨부할 수 있습니다.');}
    await loadList(true);showDetail(j);
  }catch(e){message(e.message,true);}
  finally{busy=false;controls();}
});
function readFile(f){
  return new Promise((resolve,reject)=>{
    if(!f){resolve(null);return;}
    if(!/\.(pdf|docx?|hwpx?|txt)$/i.test(f.name)){reject(new Error('지원하는 문서 파일을 선택해 주세요.'));return;}
    if(!f.size||f.size>5*1024*1024){reject(new Error('첨부파일은 비어 있지 않은 5MB 이하 파일이어야 합니다.'));return;}
    const r=new FileReader();r.onerror=()=>reject(new Error('파일을 읽지 못했습니다. 다시 선택해 주세요.'));
    r.onload=()=>resolve({name:f.name,base64:String(r.result).split(',')[1]});r.readAsDataURL(f);
  });
}
$('form').addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!loadedId||!$('form').reportValidity())return;
  busy=true;controls();message('변경 내용과 첨부파일을 저장하고 있습니다...');
  try{
    if(!requestId)requestId='req_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const d={id:loadedId,url:loadedUrl,requestId:requestId};
    ['company','title','role','deadline','status'].forEach(k=>d[k]=$(k).value.trim());
    d.file=await readFile($('file').files[0]);const r=await rpc('saveJob',d);
    fillEditor(r.job);message(r.message);await loadList(true);showDetail(r.job);
  }catch(e){message(e.message+'\n입력 내용은 유지됩니다. 다시 저장할 수 있습니다.',true);}
  finally{busy=false;controls();}
});
function showDetail(j){
  selectedId=j.id;const box=$('detail');box.replaceChildren();
  const h=document.createElement('h2');h.textContent=j.company||'기업명 확인 필요';box.appendChild(h);
  const dl=document.createElement('dl');
  [['플랫폼',j.platform],['공고명',j.title||'공고명 확인 필요'],['지원 직무',j.role||'미확인'],['마감 일자',j.deadline||'미확인 / 상시채용'],['지원 상태',j.status]].forEach(pair=>{
    const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=pair[0];dd.textContent=pair[1];dl.append(dt,dd);
  });box.appendChild(dl);
  const row=document.createElement('div');row.className='row';
  const original=link(j.url,'채용 공고 원문 열기 ↗');if(original)row.appendChild(original);
  const file=link(j.fileUrl,j.fileName||'자기소개서 파일 열기 ↗');if(file)row.appendChild(file);
  if(j.trashed){row.append(actionButton('복원',()=>changeState(j,'restore')),actionButton('영구 삭제',()=>changeState(j,'delete'),'danger'));}
  else row.append(actionButton('정보 수정 · 파일 첨부',()=>{fillEditor(j);$('editorSection').scrollIntoView({behavior:'smooth'});}),actionButton('🗑 휴지통으로 이동',()=>changeState(j,'trash'),'danger'));
  box.appendChild(row);
  if(!file){const p=document.createElement('p');p.className='muted';p.textContent='첨부파일 없음';box.appendChild(p);}
  // 이전 버전의 자기소개서 텍스트는 미리보기에 표시하지 않습니다.
  if(original){
    const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='공고 화면 미리보기';details.appendChild(summary);
    const note=document.createElement('p');note.className='muted';note.textContent='사이트가 외부 표시를 차단하면 원문 열기를 이용하세요.';details.appendChild(note);
    details.addEventListener('toggle',()=>{if(details.open&&!details.querySelector('iframe')){
      const f=document.createElement('iframe');f.title='공고 미리보기';f.sandbox='allow-scripts allow-forms allow-popups';f.referrerPolicy='no-referrer';f.src=original.href;details.appendChild(f);
    }});box.appendChild(details);
  }
}
async function changeState(j,action){
  if(busy)return;
  if(action==='delete'&&!confirm('이 공고를 영구 삭제할까요? 복원할 수 없습니다. 첨부파일도 이 기기에서 함께 삭제됩니다.'))return;
  busy=true;controls();message('처리하고 있습니다...');
  try{
    const r=await rpc('changeJobState',{id:j.id,action:action});
    if(loadedId===j.id)clearEditor();if(selectedId===j.id)clearDetail();
    message(r.message);await loadList(true);
  }catch(e){message(e.message,true);}
  finally{busy=false;controls();}
}
async function loadList(reset){
  const epoch=++listEpoch,currentView=view,offset=reset?0:next;
  if(!reset&&offset===null)return;
  $('more').disabled=true;
  try{
    const r=await rpc('listJobs',{view:currentView,offset:offset});if(epoch!==listEpoch||view!==currentView)return;
    if(reset){$('jobs').replaceChildren();shownJobs.clear();}
    $('activeTab').textContent='저장한 공고 ('+r.activeCount+')';$('trashTab').textContent='휴지통 ('+r.trashCount+')';
    if(reset&&!r.jobs.length)$('jobs').textContent=view==='trash'?'휴지통이 비어 있습니다.':'아직 저장한 공고가 없습니다.';
    r.jobs.forEach(j=>{
      if(shownJobs.has(j.id))return;shownJobs.set(j.id,j);
      const item=document.createElement('div');item.className='item';const row=document.createElement('div');row.className='companyRow';
      row.appendChild(actionButton(j.company||'기업명 확인 필요',()=>showDetail(j),'company'));
      if(j.trashed){row.append(actionButton('복원',()=>changeState(j,'restore')),actionButton('영구 삭제',()=>changeState(j,'delete'),'danger'));}
      else{const b=actionButton('🗑',()=>changeState(j,'trash'),'danger trashIcon');b.title='휴지통으로 이동';b.setAttribute('aria-label',(j.company||'공고')+' 휴지통으로 이동');row.appendChild(b);}
      const p=document.createElement('p');p.textContent=j.title||'공고명 확인 필요';
      const small=document.createElement('p');small.className='muted';small.textContent=(j.deadline||'마감일 미확인')+' · '+j.status;
      item.append(row,p,small);$('jobs').appendChild(item);
    });next=r.next;$('more').hidden=next===null;
  }catch(e){if(epoch===listEpoch)message('목록 조회 실패: '+e.message+' 화면을 다시 열면 재시도합니다.',true);}
  finally{if(epoch===listEpoch)controls();}
}
function setView(v,load=true){
  view=v==='trash'?'trash':'active';
  $('activeTab').setAttribute('aria-selected',String(view==='active'));$('trashTab').setAttribute('aria-selected',String(view==='trash'));
  $('listTitle').textContent=view==='trash'?'휴지통':'저장한 공고';
  $('listHint').textContent=view==='trash'?'삭제한 공고를 복원하거나 영구 삭제할 수 있습니다. 영구 삭제하면 첨부파일도 이 기기에서 함께 삭제됩니다.':'기업명을 누르면 상세를 볼 수 있습니다. 휴지통 버튼으로 공고를 이동할 수 있습니다.';
  $('searchSection').hidden=view==='trash';$('editorSection').hidden=view==='trash';clearDetail();
  if(load&&ready)loadList(true);
}
$('activeTab').addEventListener('click',()=>{if(!busy){if(location.hash==='#active')setView('active');else location.hash='active';}});
$('trashTab').addEventListener('click',()=>{if(!busy){if(location.hash==='#trash')setView('trash');else location.hash='trash';}});
window.addEventListener('hashchange',()=>setView(location.hash==='#trash'?'trash':'active'));
$('more').addEventListener('click',()=>loadList(false));
(async()=>{
  setView(view,false);
    try{
    const r=await rpc('getFormOptions');r.statuses.forEach(s=>{const o=document.createElement('option');o.value=s;o.textContent=s;$('status').appendChild(o);});
    ready=true;controls();message('URL을 붙여넣으면 공고가 자동 저장됩니다.');await loadList(true);
  }catch(e){message(e.message,true);}
})();

let installPrompt;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('installBtn').hidden=false;});
$('installBtn').addEventListener('click',async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('installBtn').hidden=true;}else message('아이폰: Safari 공유 → 홈 화면에 추가. PC/Android: 브라우저 메뉴 → 앱 설치.');});
$('backupBtn').addEventListener('click',async()=>{try{await exportBackup();message('공고와 첨부파일 백업을 내려받았습니다.');}catch(e){message(e.message,true);}});
$('restoreFile').addEventListener('change',async()=>{const file=$('restoreFile').files[0];if(!file)return;busy=true;controls();try{const count=await importBackup(file);clearEditor();clearDetail();await loadList(true);message(count+'개 공고를 복원했습니다.');}catch(e){message('복원 실패: '+e.message,true);}finally{$('restoreFile').value='';busy=false;controls();}});
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
