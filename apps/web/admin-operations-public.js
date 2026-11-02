import { initializeMyeonghaAnalyticsV1 } from './admin-analytics-collector.js';

// No policy or consent binding is installed: this creates no identifier, reads
// no browser storage/referrer and sends no analytics requests.
export const analytics = initializeMyeonghaAnalyticsV1();

export async function loadPublishedPresentationsV1({fetchImpl=fetch,documentImpl=document}={}) {
  try {
    const response=await fetchImpl('/.well-known/myeongha/presentations',{method:'GET',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
    if(!response.ok)return;
    const body=await response.json();
    if(body?.version!=='public-presentations-v1'||!Array.isArray(body.entries)||body.entries.length>20)return;
    const section=documentImpl.createElement('section');section.className='admin-public-notices';section.setAttribute('aria-label','서비스 공지');
    for(const entry of body.entries){
      if(!['notice','banner'].includes(entry.kind)||typeof entry.title!=='string'||entry.title.length>160||typeof entry.body!=='string'||entry.body.length>5000)continue;
      const article=documentImpl.createElement('article');const title=documentImpl.createElement('h2');title.textContent=entry.title;
      const text=documentImpl.createElement('p');text.textContent=entry.body;article.append(title,text);
      if(typeof entry.linkPath==='string'&&/^\/[A-Za-z0-9/_.-]*(?:\?[A-Za-z0-9_.%=&-]*)?$/u.test(entry.linkPath)&&!entry.linkPath.startsWith('//')&&!entry.linkPath.includes('..')){
        const link=documentImpl.createElement('a');link.href=entry.linkPath;link.textContent='자세히 보기';article.append(link);
      }
      section.append(article);
    }
    if(section.childElementCount>0)documentImpl.body.append(section);
  }catch{ /* An unavailable optional feed must not interrupt the user application. */ }
}
if(typeof document!=='undefined')void loadPublishedPresentationsV1();
