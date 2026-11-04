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
  let visited = 0;
  function walk(v, depth = 0) {
    if (depth > 30 || ++visited > 20000) return;
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(item => walk(item, depth + 1)); return; }
    const types = [].concat(v['@type'] || []);
    if (types.some(t => /(^|[/#])JobPosting$/.test(String(t)))) jobs.push(v);
    Object.keys(v).forEach(k => walk(v[k], depth + 1));
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

function date_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || +s.slice(0,4)<1900) throw new Error('마감 일자를 확인해 주세요.');
  const d = new Date(s+'T00:00:00Z');
  if (isNaN(d.getTime()) || d.toISOString().slice(0,10)!==s) throw new Error('실제 존재하는 마감 일자를 입력해 주세요.');
  return s;
}

export { parseJob_, date_ };
