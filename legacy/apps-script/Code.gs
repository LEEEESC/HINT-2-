const CFG = {
  headers: ['공고ID','채용플랫폼','기업명','공고명','지원직무','마감일시','지원상태','자기소개서내용','공고URL','첨부파일명','첨부파일URL','저장요청ID','삭제일시'],
  sites: {'saramin.co.kr':'사람인','jobkorea.co.kr':'잡코리아','jasoseol.com':'자소설닷컴','incruit.com':'인크루트','incruit.co.kr':'인크루트','dmand.co.kr':'디맨드'},
  statuses: ['관심공고','서류작성중','서류완료','지원완료','서류합격','최종합격'],
  maxBytes: 5 * 1024 * 1024
};

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('구글 시트 → 확장 프로그램 → Apps Script에서 setup을 실행해 주세요.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    const saved = props.getProperties();
    const matches = ss.getSheets().filter(s => headerOK_(s, 9));
    let sheet = saved.SPREADSHEET_ID === ss.getId()
      ? matches.find(s => String(s.getSheetId()) === saved.JOB_SHEET_ID) : null;
    if (!sheet) sheet = matches.includes(ss.getActiveSheet()) ? ss.getActiveSheet() : (matches.length === 1 ? matches[0] : null);
    if (!sheet && matches.length > 1) throw new Error('사용할 공고 시트 탭을 선택하고 setup을 다시 실행해 주세요.');
    // 기존 메모 열은 덮어쓰지 않습니다.
    if (sheet && sheet.getLastColumn() > 9 && !headerOK_(sheet, 12)) {
      throw new Error('기존 시트 J열 이후에 다른 내용이 있습니다. J:L열을 비운 후 setup을 실행해 주세요.');
    }
    if (sheet && sheet.getLastColumn() > 12 && !headerOK_(sheet, 13)) {
      throw new Error('기존 시트 M열에 다른 내용이 있습니다. 해당 내용을 다른 열로 옮긴 후 setup을 실행해 주세요.');
    }
    if (!sheet) {
      let name = '취업공고', n = 2;
      while (ss.getSheetByName(name)) name = '취업공고_' + n++;
      sheet = ss.insertSheet(name);
    }
    if (sheet.getMaxColumns() < 13) sheet.insertColumnsAfter(sheet.getMaxColumns(), 13 - sheet.getMaxColumns());
    sheet.getRange(1,1,1,13).setValues([CFG.headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    props.setProperties({SPREADSHEET_ID:ss.getId(), JOB_SHEET_ID:String(sheet.getSheetId())});
    let folder;
    if (saved.UPLOAD_FOLDER_ID) folder = DriveApp.getFolderById(saved.UPLOAD_FOLDER_ID);
    else {
      folder = DriveApp.createFolder('취업 정보 허브_자기소개서');
      props.setProperty('UPLOAD_FOLDER_ID', folder.getId());
    }
    // URL 수집 권한도 setup 실행 시 요청합니다.
    UrlFetchApp.getRequest('https://www.saramin.co.kr/');
    return '설정 완료: ' + sheet.getName() + ' / 첨부 폴더: ' + folder.getName();
  } finally { lock.releaseLock(); }
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index').setTitle('취업 정보 허브')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}
function headerOK_(s,n) {
  if (s.getMaxColumns() < n) return false;
  const row = s.getRange(1,1,1,n).getDisplayValues()[0];
  return row.every((v,i) => String(v).replace(/\s/g,'') === CFG.headers[i]);
}
function sheet_() {
  const p = PropertiesService.getScriptProperties().getProperties();
  if (!p.SPREADSHEET_ID) throw new Error('setup을 먼저 실행해 주세요.');
  const ss = SpreadsheetApp.openById(p.SPREADSHEET_ID);
  const s = ss.getSheets().find(s => String(s.getSheetId()) === p.JOB_SHEET_ID);
  if (!s || !headerOK_(s,13)) throw new Error('시트 연결이나 열 구성이 변경되었습니다. setup을 다시 실행해 주세요.');
  return s;
}
function getFormOptions() {
  const s = sheet_();
  return {statuses:CFG.statuses,timeZone:s.getParent().getSpreadsheetTimeZone(),maxBytes:CFG.maxBytes};
}
function text_(v,max) {
  const s = v == null ? '' : String(v).trim();
  if (s.length > max) throw new Error('입력 내용이 허용 길이를 초과했습니다.');
  return s;
}
function jobURL_(v) {
  const url = text_(v,2000);
  const m = /^https:\/\/([a-z0-9.-]+)(?::443)?(\/[^\s\\]*)?$/i.exec(url);
  if (!m) throw new Error('https://로 시작하는 채용 사이트 공고 주소를 입력해 주세요.');
  const host = m[1].toLowerCase();
  const domain = Object.keys(CFG.sites).find(d => host === d || host.endsWith('.'+d));
  if (!domain) throw new Error('지원 사이트: 사람인, 잡코리아, 자소설닷컴, 인크루트, 디맨드');
  return {url:url,platform:CFG.sites[domain]};
}
function fetchHTML_(url) {
  for (let i=0;i<5;i++) {
    jobURL_(url);
    const r = UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:false});
    const code = r.getResponseCode();
    if ([301,302,303,307,308].includes(code)) {
      const headers = r.getAllHeaders();
      const key = Object.keys(headers).find(k => k.toLowerCase()==='location');
      let next = key ? String(headers[key]) : '';
      const origin = /^https:\/\/[^/]+/.exec(url)[0];
      if (next.startsWith('//')) next = 'https:' + next;
      else if (next.startsWith('/')) next = origin + next;
      else if (!/^https:\/\//i.test(next)) throw new Error('이동 주소를 확인할 수 없습니다. 최종 공고 URL을 복사해 주세요.');
      url = next;
      continue;
    }
    if (code !== 200) throw new Error('사이트 응답 '+code+': 자동 수집이 제한되었습니다.');
    let html = r.getContentText();
    if (/charset\s*=\s*["']?(?:euc-kr|ks_c_5601-1987)/i.test(html.slice(0,10000))) html = r.getContentText('EUC-KR');
    if (html.length > 4000000) throw new Error('공고 페이지가 너무 큽니다.');
    return html;
  }
  throw new Error('주소 이동이 너무 많습니다. 최종 공고 URL을 사용해 주세요.');
}
function decode_(s) {
  return String(s || '').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n) => {
    const code = n[0].toLowerCase()==='x' ? parseInt(n.slice(1),16) : Number(n);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }).replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&');
}
function clean_(s) { return decode_(String(s || '').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim(); }
function attrs_(tag) {
  const out = {};
  tag.replace(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,(_,k,a,b,c) => {
    out[k.toLowerCase()] = decode_(a===undefined ? (b===undefined ? c : b) : a);
    return '';
  });
  return out;
}
function parseJob_(html, platform) {
  const meta = {};
  (html.match(/<meta\b[^>]*>/gi)||[]).forEach(tag => {
    const a = attrs_(tag);
    meta[a.property || a.name || a.itemprop || ''] = a.content || '';
  });
  const jobs = [];
  function walk(v) {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    const types = [].concat(v['@type'] || []);
    if (types.some(t => /(^|[/#])JobPosting$/.test(String(t)))) jobs.push(v);
    Object.keys(v).forEach(k => walk(v[k]));
  }
  const scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi)||[];
  scripts.forEach(tag => {
    if (!/application\/ld\+json/i.test(tag.slice(0,tag.indexOf('>')))) return;
    const raw = tag.slice(tag.indexOf('>')+1).replace(/<\/script\s*>$/i,'').trim();
    try { walk(JSON.parse(raw)); } catch (_) {}
  });
  // 여러 공고가 있는 목록 페이지에서는 첫 번째 공고를 임의로 고르지 않습니다.
  if (jobs.length > 1) throw new Error('여러 공고가 있는 목록입니다. 개별 공고 상세 URL을 사용해 주세요.');
  const j = jobs[0] || {};
  const named = v => clean_(typeof v === 'string' ? v : v && v.name || '');
  const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  let title = clean_(j.title || meta['og:title'] || meta['twitter:title'] || (titleTag && titleTag[1]));
  let company = named(j.hiringOrganization) || clean_(meta['job:company'] || meta['company']);
  const bracket = /^\[([^\]]+)\]\s*(.+)$/.exec(title);
  if (!company && bracket) { company = bracket[1]; title = bracket[2]; }
  title = title.replace(/\s*[|｜]\s*(사람인|잡코리아|자소설닷컴|인크루트|디맨드).*$/,'').trim();
  let role = named(j.relevantOccupation) || named(j.occupationalCategory);
  // 구조화 데이터의 title은 직무명으로 정의됩니다.
  if (!role && j.title) role = clean_(j.title);
  const rawDate = String(j.validThrough || meta['job:expiration_date'] || meta['validThrough'] || '');
  const dm = /^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(rawDate);
  let deadline = dm ? dm[1] : '';
  if (deadline) { try { date_(deadline); } catch (_) { deadline = ''; } }
  return {platform:platform,company:company.slice(0,200),title:title.slice(0,300),role:role.slice(0,200),deadline:deadline};
}
function importJob(url) {
  const info = jobURL_(url);
  let job = {platform:info.platform,company:'',title:'',role:'',deadline:''};
  let warning = '';
  try { job = parseJob_(fetchHTML_(info.url), info.platform); }
  catch(e) { warning = e.message || String(e); }
  const missing = [['company','기업명'],['title','공고명'],['role','지원 직무'],['deadline','마감 일자']]
    .filter(p => !job[p[0]]).map(p => p[1]);
  job.url = info.url;
  job.warning = [warning,missing.length ? '자동 확인 불가: '+missing.join(', ')+'. 원문을 확인해 보완해 주세요.' : '자동 수집 결과를 원문과 확인한 후 저장해 주세요.'].filter(Boolean).join('\n');
  return autoSaveJob_(job);
}
function date_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || +s.slice(0,4)<1900) throw new Error('마감 일자를 확인해 주세요.');
  const d = new Date(s+'T00:00:00Z');
  if (isNaN(d.getTime()) || d.toISOString().slice(0,10)!==s) throw new Error('실제 존재하는 마감 일자를 입력해 주세요.');
  return s;
}
function file_(f) {
  if (!f) return null;
  const name = text_(f.name,200).replace(/[\/\\\x00-\x1f]/g,'_');
  const ext = name.split('.').pop().toLowerCase();
  const types = {pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',hwp:'application/x-hwp',hwpx:'application/vnd.hancom.hwpx',txt:'text/plain'};
  if (!types[ext]) throw new Error('PDF, DOC, DOCX, HWP, HWPX, TXT 파일을 선택해 주세요.');
  const b64 = String(f.base64 || '');
  if (!b64 || b64.length > Math.ceil(CFG.maxBytes/3)*4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw new Error('첨부파일이 비어 있거나 5MB를 초과합니다.');
  const bytes = Utilities.base64Decode(b64);
  if (!bytes.length || bytes.length > CFG.maxBytes) throw new Error('첨부파일은 5MB 이하여야 합니다.');
  return Utilities.newBlob(bytes,types[ext],name);
}
// 셀 입력이 수식으로 처리되지 않도록 저장합니다.
function cell_(v) {
  return typeof v === 'string' && /^[=']/.test(v) ? "'" + v : v;
}
function rows_(s) {
  const n = s.getLastRow() - 1;
  return n > 0 ? s.getRange(2,1,n,13).getValues() : [];
}
function job_(r,zone) {
  return {
    id:String(r[0]), platform:String(r[1] || ''), company:String(r[2] || ''),
    title:String(r[3] || ''), role:String(r[4] || ''),
    deadline:r[5] instanceof Date ? Utilities.formatDate(r[5],zone,'yyyy-MM-dd') : String(r[5] || ''),
    status:String(r[6] || ''), url:String(r[8] || ''),
    fileName:String(r[9] || ''), fileUrl:String(r[10] || ''),
    trashed:!!r[12], deletedAt:r[12] instanceof Date ? r[12].toISOString() : String(r[12] || '')
  };
}
function writeRow_(s,n,row) {
  if (n > s.getMaxRows()) s.insertRowsAfter(s.getMaxRows(),n-s.getMaxRows());
  s.getRange(n,1,1,13).setNumberFormat('@').setValues([row.map(cell_)]);
}
function urlKey_(url) { return String(url).trim().replace(/#.*$/,''); }
function autoSaveJob_(job) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const s = sheet_(), rows = rows_(s);
    const existing = rows.find(r => urlKey_(r[8]) === urlKey_(job.url));
    const zone = s.getParent().getSpreadsheetTimeZone();
    if (existing) {
      const result = job_(existing,zone);
      result.warning = result.trashed
        ? '이 공고는 휴지통에 있습니다. 휴지통 화면에서 복원할 수 있습니다.'
        : '이미 저장된 공고를 불러왔습니다. 기존 수정 내용과 첨부파일을 유지했습니다.';
      return result;
    }
    const row = [Utilities.getUuid(),job.platform,job.company,job.title,job.role,
      job.deadline,CFG.statuses[0],'',job.url,'','','',''];
    writeRow_(s,s.getLastRow()+1,row);
    SpreadsheetApp.flush();
    const result = job_(row,zone);
    result.warning = job.warning;
    return result;
  } finally { lock.releaseLock(); }
}
function saveJob(d) {
  if (!d || typeof d !== 'object') throw new Error('입력 내용을 확인해 주세요.');
  const info = jobURL_(d.url), id = text_(d.id,100);
  const company = text_(d.company,200), title = text_(d.title,300), role = text_(d.role,200);
  if (!company || !title || !role) throw new Error('기업명, 공고명, 지원 직무를 확인해 주세요.');
  const deadline = d.deadline ? date_(text_(d.deadline,10)) : '';
  const status = text_(d.status,50);
  if (!CFG.statuses.includes(status)) throw new Error('지원 상태를 선택해 주세요.');
  const requestId = text_(d.requestId,100);
  if (!/^[a-zA-Z0-9_-]{10,100}$/.test(requestId)) throw new Error('화면을 새로고침하고 다시 저장해 주세요.');
  const blob = file_(d.file);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let file = null, committed = false;
  try {
    const s = sheet_(), rows = rows_(s);
    const index = rows.findIndex(r => String(r[0]) === id);
    if (index < 0) throw new Error('공고를 찾을 수 없습니다. URL을 다시 불러와 주세요.');
    const row = rows[index];
    if (row[12]) throw new Error('휴지통에 있는 공고입니다. 먼저 복원해 주세요.');
    if (urlKey_(row[8]) !== urlKey_(info.url)) throw new Error('공고 URL이 변경되었습니다. 다시 불러와 주세요.');
    if (String(row[11]) === requestId) return {message:'이미 저장된 변경 내용입니다.',job:job_(row,s.getParent().getSpreadsheetTimeZone())};
    if (blob) {
      const folderId = PropertiesService.getScriptProperties().getProperty('UPLOAD_FOLDER_ID');
      if (!folderId) throw new Error('setup을 다시 실행하여 첨부 폴더를 연결해 주세요.');
      file = DriveApp.getFolderById(folderId).createFile(blob);
    }
    row[1]=info.platform;row[2]=company;row[3]=title;row[4]=role;
    row[5]=deadline;row[6]=status;row[11]=requestId;
    // 새 파일이 없으면 기존 첨부파일을 유지합니다.
    if (file) {row[9]=file.getName();row[10]=file.getUrl();}
    writeRow_(s,index+2,row);
    committed = true;
    SpreadsheetApp.flush();
    return {message:'공고 변경 내용과 첨부파일을 저장했습니다.',job:job_(row,s.getParent().getSpreadsheetTimeZone())};
  } catch(e) {
    if (file && !committed) { try { file.setTrashed(true); } catch (_) {} }
    throw e;
  } finally { lock.releaseLock(); }
}
function listJobs(query) {
  query = query || {};
  const s = sheet_(), all = rows_(s);
  const trash = query.view === 'trash';
  const rows = all.filter(r => r[0] && (!!r[12] === trash)).reverse();
  const offset = Math.max(0,Math.floor(Number(query.offset)||0));
  const slice = rows.slice(offset,offset+50);
  const zone = s.getParent().getSpreadsheetTimeZone();
  return {jobs:slice.map(r=>job_(r,zone)),next:offset+slice.length<rows.length?offset+slice.length:null,
    activeCount:all.filter(r=>r[0]&&!r[12]).length,trashCount:all.filter(r=>r[0]&&r[12]).length};
}
function changeJobState(d) {
  if (!d || !['trash','restore','delete'].includes(d.action)) throw new Error('잘못된 요청입니다.');
  const id = text_(d.id,100);
  if (!id) throw new Error('공고 ID가 없습니다.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const s = sheet_(), rows = rows_(s);
    const i = rows.findIndex(r=>String(r[0])===id);
    // 영구 삭제 재시도는 성공으로 처리합니다.
    if (i < 0) {
      if(d.action==='delete')return {message:'이미 삭제된 공고입니다.'};
      throw new Error('공고를 찾을 수 없습니다.');
    }
    const row = rows[i];
    if(d.action==='delete') {
      if(!row[12])throw new Error('휴지통으로 이동한 공고만 영구 삭제할 수 있습니다.');
      // 공고 기록만 삭제하며 Google Drive의 첨부파일은 보존합니다.
      s.deleteRow(i+2);
    } else if(d.action==='trash') {
      if(!row[12])s.getRange(i+2,13).setValue(new Date().toISOString());
    } else {
      s.getRange(i+2,13).clearContent();
    }
    SpreadsheetApp.flush();
    return {message:d.action==='trash'?'휴지통으로 이동했습니다.':d.action==='restore'?'저장한 공고로 복원했습니다.':'공고를 영구 삭제했습니다. 첨부파일은 Google Drive에 유지됩니다.'};
  } finally { lock.releaseLock(); }
}
