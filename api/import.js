import { parseJob_ } from '../lib/parser.js';
export const sites = {'saramin.co.kr':'사람인','jobkorea.co.kr':'잡코리아','jasoseol.com':'자소설닷컴','incruit.com':'인크루트','incruit.co.kr':'인크루트','dmand.co.kr':'디맨드'};
export function validateURL(value) {
  if(typeof value!=='string'||value.length>2000)throw new Error('공고 URL을 확인해 주세요.');
  const u=new URL(value);
  const domain=Object.keys(sites).find(d=>u.hostname===d||u.hostname.endsWith('.'+d));
  if(u.protocol!=='https:'||u.username||u.password||u.port||!domain)throw new Error('지원하는 채용 사이트의 HTTPS 공고 주소를 사용해 주세요.');
  u.hash='';return {url:u.href,platform:sites[domain]};
}
export async function fetchHTML(url,fetcher=fetch) {
  const signal=AbortSignal.timeout(20000);
  for(let i=0;i<5;i++) {
    validateURL(url);
    const r=await fetcher(url,{redirect:'manual',signal,headers:{'Accept':'text/html,application/xhtml+xml','User-Agent':'JobHub/1.0 (job metadata preview)'}});
    if([301,302,303,307,308].includes(r.status)){
      const location=r.headers.get('location');if(!location)throw new Error('이동 주소가 없습니다.');url=new URL(location,url).href;continue;
    }
    if(!r.ok)throw new Error('사이트 응답 '+r.status+': 자동 수집이 제한되었습니다.');
    if(!r.body)throw new Error('공고 본문이 없습니다.');
    const reader=r.body.getReader(),chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2500000){await reader.cancel();throw new Error('공고 페이지가 너무 큽니다.');}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let html=new TextDecoder().decode(bytes);
    if(/euc-kr|ks_c_5601-1987/i.test((r.headers.get('content-type')||'')+html.slice(0,10000)))html=new TextDecoder('euc-kr').decode(bytes);
    return html;
  }
  throw new Error('주소 이동이 너무 많습니다. 최종 공고 주소를 사용해 주세요.');
}
export async function POST(request) {
  const headers={'Cache-Control':'no-store'};
  try {
    const origin=request.headers.get('origin');
    if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'허용되지 않은 요청입니다.'},{status:403,headers});
    const raw=await request.text();if(raw.length>4096)return Response.json({error:'요청이 너무 큽니다.'},{status:413,headers});
    const info=validateURL(JSON.parse(raw).url);
    let job={...info,company:'',title:'',role:'',deadline:''},warning='';
    try{job={...job,...parseJob_(await fetchHTML(info.url),info.platform)};}
    catch(e){warning=e.name==='TimeoutError'?'사이트 응답 시간이 초과되었습니다.':e.message;}
    const missing=[['company','기업명'],['title','공고명'],['role','지원 직무'],['deadline','마감 일자']].filter(([k])=>!job[k]).map(([,v])=>v);
    job.warning=[warning,missing.length?'자동 확인 불가: '+missing.join(', ')+'. 원문을 확인해 보완해 주세요.':'자동 수집 결과를 원문과 확인해 주세요.'].filter(Boolean).join('\n');
    return Response.json(job,{headers});
  }catch(e){console.warn('Import rejected:',e.name);return Response.json({error:'지원하는 사이트의 올바른 공고 URL을 입력해 주세요.'},{status:400,headers});}
}
