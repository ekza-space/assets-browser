import { t, locale, number, localizeShell } from './i18n.js';
import { isPublic, request as api, downloadBlob } from './storage.js';
if(isPublic){document.querySelector('.local-badge').innerHTML='<i></i> IPFS LIBRARY';document.querySelector('.sidebar-bottom p').innerHTML='Авторы и лицензии сохранены.<br>Оценки хранятся в этом браузере.';document.getElementById('local-filter').hidden=true;}
localizeShell();
const $ = id => document.getElementById(id);
const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = {items:[],reviews:{},filtered:[],selected:null,view:'all',collection:'',local:true,limit:60,query:'',rating:0,license:'',sort:'name'};
let viewer, viewerPromise, selectedGeneration=0, toastTimer, loading=false, reviewQueue=Promise.resolve();
const colors=['#b1c78f','#abafd4','#c8958a','#8fada4','#c3ad79','#b98bae','#b4c692','#87b8c0','#9ca4ba'];
function toast(message) { $('toast').textContent=message; $('toast').hidden=false; clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500); }

function review(item) {return state.reviews[item.key] || {rating:0,liked:false};}
function stars(item,large=false) {const value=review(item).rating;return `<div class="stars" aria-label="${t('Оценка {rating} из 5',{rating:value})}">${[1,2,3,4,5].map(n=>`<button class="star ${n<=value?'on':''}" data-rating="${n}" data-key="${escape(item.key)}" aria-label="${t('{rating} из 5 для {name}',{rating:n,name:escape(item.name)})}" title="${t('{rating} звёзд; повторный клик снимает оценку',{rating:n})}">★</button>`).join('')}</div>`;}
function stats() { $('total').textContent=state.items.length.toLocaleString(locale);$('liked-count').textContent=Object.values(state.reviews).filter(r=>r.liked).length;$('rated-count').textContent=Object.values(state.reviews).filter(r=>r.rating>0).length; }
function renderGrid() {
 const q=state.query.toLocaleLowerCase().trim();
 state.filtered=state.items.filter(i=>(!state.local||i.local)&&(!state.collection||i.collection_id===state.collection)&&(!state.license||i.license===state.license)&&review(i).rating>=state.rating&&(state.view==='all'||state.view==='liked'&&review(i).liked||state.view==='rated'&&review(i).rating>0||state.view==='unrated'&&!review(i).rating)&&(!q||[i.name,i.author,i.collection_name,...(i.tags||[])].join(' ').toLocaleLowerCase().includes(q)));
 if(state.sort==='name')state.filtered.sort((a,b)=>a.name.localeCompare(b.name));
 if(state.sort==='rating')state.filtered.sort((a,b)=>review(b).rating-review(a).rating);
 if(state.sort==='size')state.filtered.sort((a,b)=>(a.bytes||Infinity)-(b.bytes||Infinity));
 $('result-count').textContent=t('{count} ассетов',{count:number(state.filtered.length)});
 $('grid').innerHTML=state.filtered.slice(0,state.limit).map((item,index)=>{const r=review(item),src=item.render||item.thumbnail;return `<article class="asset-card ${item.key===state.selected?.key?'selected':''}" data-asset="${escape(item.key)}"><button class="card-preview" data-select="${escape(item.key)}" aria-label="${t('Открыть {name}',{name:escape(item.name)})}">${src?`<img src="${escape(src)}" alt="${escape(item.name)}" loading="lazy" decoding="async">`:`<span class="placeholder">◈</span><span class="missing-note">${item.local?t('Превью ещё нет'):t('Нет на диске')}</span>`}</button><span class="card-index">${String(index+1).padStart(3,'0')} / ${item.format||'VRM'}</span><button class="card-like ${r.liked?'liked':''}" data-like="${escape(item.key)}" aria-label="${t('Лайк {name}',{name:escape(item.name)})}" aria-pressed="${r.liked}">${r.liked?'♥':'♡'}</button><div class="card-content"><h3 class="card-name">${escape(item.name)}</h3><div class="card-author">${t('by')} ${escape(item.author)}</div><div class="card-bottom">${stars(item)}<span class="license">${escape(item.license)}</span></div></div></article>`;}).join('');
 $('empty').hidden=state.filtered.length>0;$('more').hidden=state.filtered.length<=state.limit;stats();updateArrows();
}
function safeLink(value) { try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?escape(u.href):'';}catch{return '';}}
function details(item,info=state.info) {
 if(!item)return;
 const r=review(item); const source=safeLink(item.source_url)||'https://www.opensourceavatars.com/en/gallery';
 $('details').innerHTML=`<div class="detail-eyebrow"><span>${t('Без классификации')}</span><span class="license">${escape(item.license)}</span></div><div class="asset-title"><h2>${escape(item.name)}</h2><button class="detail-like ${r.liked?'active':''}" data-like="${escape(item.key)}" aria-label="${t('Лайк {name}',{name:escape(item.name)})}" aria-pressed="${r.liked}">${r.liked?'♥':'♡'}</button></div><div class="author-line">${t('Автор')} &nbsp;<strong>${escape(item.author)}</strong></div><div class="rating-row">${stars(item,true)}<span class="rating-label">${r.rating?`${r.rating} / 5`:t('Без оценки')}</span></div><div class="meta-grid"><div><small>${t('ФОРМАТ')}</small><span>${info?.kind==='vrm0'?'VRM 0.x':info?.kind==='vrm1'?'VRM 1.0':escape(item.format)}</span></div><div><small>${t('РАЗМЕР')}</small><span>${item.local?(item.bytes/1024/1024).toFixed(1)+' MB':t('Нет на диске')}</span></div><div><small>${t('ТРЕУГОЛЬНИКИ')}</small><span>${info?info.triangles.toLocaleString(locale):'—'}</span></div><div><small>${t('КОСТИ / МЕШИ')}</small><span>${info?`${info.bones} / ${info.meshes}`:'—'}</span></div></div><p class="credit">${escape(item.collection_name)} ${t('by')} ${escape(item.author)} · ${escape(item.license)}.<br><a href="${source}" target="_blank" rel="noreferrer">${t('Источник и атрибуция ↗')}</a></p>`;
 $('download').href=item.model||'#';$('download').hidden=!item.local;$('download').download=`${item.name}.vrm`;
}
async function getViewer() {
 if(!viewerPromise)viewerPromise=import('./viewer.js').then(({AssetViewer}) => viewer=new AssetViewer($('canvas-mount'),{onProgress:p=>{if(document.activeElement!==$('timeline'))$('timeline').value=p;}})).catch(error=>{viewerPromise=null;throw error;});
 return viewerPromise;
}
function status(message) { $('viewer-status').hidden=!message;$('viewer-status').textContent=message; }
function updateArrows(){const index=state.filtered.findIndex(i=>i.key===state.selected?.key);$('previous').disabled=index<=0;$('next').disabled=index<0||index>=state.filtered.length-1;}
async function select(item) {
 const generation=++selectedGeneration;state.selected=item;state.info=null;loading=true;
 history.replaceState(null,'',`#${encodeURIComponent(item.key)}`);
 document.querySelectorAll('.asset-card').forEach(c=>c.classList.toggle('selected',c.dataset.asset===item.key));details(item);updateArrows();
 $('animation').innerHTML='<option value="-1">T-pose</option>';$('animation-source').textContent='';$('expressions').replaceChildren();$('save-preview').disabled=true;
 $('animation-credit').textContent='';$('timeline').value=0;
 ['wire','skeleton','rotate'].forEach(id=>$(id).setAttribute('aria-pressed','false'));
 if(!item.local){viewer?.clear();loading=false;status(t('Модель есть в каталоге, но ещё не скачана.'));return;}
 status(t('Загружаем модель…'));
 try {
  const v=await getViewer();if(generation!==selectedGeneration)return;
  const info=await v.load(item.model);if(generation!==selectedGeneration||!info)return;
  state.info=info;loading=false;status('');details(item,info);$('save-preview').disabled=false;
  $('model-format').textContent=info.kind==='vrm0'?'VRM 0.x':info.kind==='vrm1'?'VRM 1.0':'GLTF';
  $('animation').innerHTML=`<option value="-1">${t('T-pose / покой')}</option>${info.clips.map((c,i)=>`<option value="${i}">${escape(c)}</option>`).join('')}`;
  $('animation').value=String(v.action?info.clips.indexOf(v.action.getClip().name):-1);
  $('animation-source').textContent=info.embedded?t('ИЗ МОДЕЛИ'):info.clips.length?t('SDK LIBRARY'):t('НЕТ КЛИПОВ');
  $('animation-credit').textContent=info.embedded?t('Оригинальные клипы, встроенные в модель.'):info.clips.length?t('Тестовые движения SDK · Quaternius, CC0. Не являются анимациями автора модели.'):t('В этой модели нет доступных анимаций.');
  $('play').textContent=v.playing?'Ⅱ':'▶';
  $('expressions').innerHTML=info.expressions.filter(n=>!['blinkLeft','blinkRight','lookUp','lookDown','lookLeft','lookRight'].includes(n)).slice(0,8).map(n=>`<label class="expression-row">${escape(n)}<input type="range" min="0" max="1" step=".01" value="0" data-expression="${escape(n)}" aria-label="${t('Выражение {name}',{name:escape(n)})}"></label>`).join('');
  if(!isPublic&&!item.render) {try {const blob=await v.snapshot();if(generation===selectedGeneration)await saveRender(item,blob,false);} catch(error) {toast(t('3D доступно, но превью не сохранено: {error}',{error:error.message}));}}
 }catch(error){if(generation!==selectedGeneration)return;loading=false;status(t('Не удалось открыть модель. {error}',{error:error.message}));console.error(error);}
}
async function saveRender(item,blob,announce) { if(isPublic){downloadBlob(blob,`${item.name}-preview.png`);return;} const r=await api(`/api/renders/${item.token}`,{method:'POST',headers:{'Content-Type':'image/png'},body:blob});item.render=r.url;const image=document.querySelector(`[data-asset="${CSS.escape(item.key)}"] img`);if(image)image.src=`${r.url}?v=${Date.now()}`;if(announce)toast(t('Прозрачное PNG-превью сохранено в библиотеке')); }
function saveReview(key,patch){
 // Serialize patches so fast keyboard rating/liking cannot overwrite newer intent.
 reviewQueue=reviewQueue.then(async()=>{const old=state.reviews[key]||{rating:0,liked:false};const value=patch.rating!==undefined?{rating:old.rating===patch.rating?0:patch.rating}:{liked:!old.liked};
 try{state.reviews[key]=await api(`/api/reviews/${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});renderGrid();if(state.selected?.key===key)details(state.selected);}
 catch(error){toast(t('Оценка не сохранена: {error}',{error:error.message}));}
 });return reviewQueue;
}
function navigate(delta){const index=state.filtered.findIndex(i=>i.key===state.selected?.key);const item=state.filtered[index+delta];if(item){select(item);if(index+delta>=state.limit){state.limit+=60;renderGrid();}document.querySelector(`[data-asset="${CSS.escape(item.key)}"]`)?.scrollIntoView({block:'nearest',behavior:'smooth'});}}
document.addEventListener('click',event=>{const rating=event.target.closest('[data-rating]'),like=event.target.closest('[data-like]'),card=event.target.closest('[data-select]');if(rating)saveReview(rating.dataset.key,{rating:Number(rating.dataset.rating)});else if(like)saveReview(like.dataset.like,{liked:true});else if(card){const item=state.items.find(i=>i.key===card.dataset.select);select(item);if(innerWidth<621){document.body.classList.add('focus');$('focus-mode').classList.add('active');$('grid-mode').classList.remove('active');window.scrollTo({top:0,behavior:'smooth'});}}});
$('search').addEventListener('input',e=>{state.query=e.target.value;state.limit=60;renderGrid();});
for(const [id,key] of [['rating-filter','rating'],['license-filter','license'],['sort','sort']])$(id).onchange=e=>{state[key]=key==='rating'?Number(e.target.value):e.target.value;state.limit=60;renderGrid();};
$('local-filter').onclick=()=>{state.local=!state.local;$('local-filter').classList.toggle('active',state.local);$('local-filter').setAttribute('aria-pressed',state.local);state.limit=60;renderGrid();};
$('views').onclick=e=>{const b=e.target.closest('[data-view]');if(!b)return;state.view=b.dataset.view;state.collection='';state.limit=60;document.querySelectorAll('[data-view]').forEach(n=>n.classList.toggle('active',n===b));document.querySelectorAll('[data-collection]').forEach(n=>n.classList.remove('active'));$('heading').textContent={all:t('Все ассеты.'),liked:t('Избранное.'),rated:t('С оценкой.'),unrated:t('Без оценки.')}[state.view];renderGrid();};
$('unclassified').onclick=()=>document.querySelector('[data-view=all]').click();
$('reset-filters').onclick=()=>{state.query='';state.rating=0;state.license='';state.collection='';state.view='all';$('search').value='';$('rating-filter').value='0';$('license-filter').value='';document.querySelector('[data-view=all]').click();};
$('more').onclick=()=>{state.limit+=60;renderGrid();};
$('next').onclick=()=>navigate(1);$('previous').onclick=()=>navigate(-1);
$('fit').onclick=()=>viewer?.fit();
$('animation').onchange=e=>viewer?.setAnimation(Number(e.target.value));$('speed').onchange=e=>{if(viewer)viewer.speed=Number(e.target.value);};
$('play').onclick=()=>{if(viewer){viewer.playing=!viewer.playing;$('play').textContent=viewer.playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',viewer.playing?t('Пауза'):t('Воспроизведение'));}};
$('timeline').oninput=e=>viewer?.seek(Number(e.target.value));
$('expressions').oninput=e=>{if(e.target.dataset.expression)viewer?.setExpression(e.target.dataset.expression,Number(e.target.value));};
for(const id of ['rotate','wire','skeleton'])$(id).onclick=()=>{if(!viewer||loading)return;const on=$(id).getAttribute('aria-pressed')!=='true';$(id).setAttribute('aria-pressed',on);if(id==='rotate')viewer.controls.autoRotate=on;if(id==='wire')viewer.setWireframe(on);if(id==='skeleton')viewer.setSkeleton(on);};
let background=0;$('background').onclick=()=>{background=(background+1)%3;$('viewport').classList.toggle('checker',background===1);$('viewport').classList.toggle('light',background===2);};
for(const mode of ['grid','focus'])$(`${mode}-mode`).onclick=()=>{document.body.classList.toggle('focus',mode==='focus');$('grid-mode').classList.toggle('active',mode==='grid');$('focus-mode').classList.toggle('active',mode==='focus');};
$('save-preview').onclick=async()=>{if(!state.selected||loading||!viewer)return;const item=state.selected;try{const blob=await viewer.snapshot();await saveRender(item,blob,true);}catch(e){toast(e.message);}};
$('export').onclick=async()=>{try{const data=await api('/api/reviews/export');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`ekza-asset-reviews-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){toast(e.message);}};
document.addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea')||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key==='/'){e.preventDefault();$('search').focus();}if(e.key==='ArrowRight'){e.preventDefault();navigate(1);}if(e.key==='ArrowLeft'){e.preventDefault();navigate(-1);}if(state.selected&&/^[0-5]$/.test(e.key))saveReview(state.selected.key,{rating:Number(e.key)});if(state.selected&&e.key.toLowerCase()==='l')saveReview(state.selected.key,{liked:true});if(e.key===' '){e.preventDefault();$('play').click();}if(e.key==='Escape')$('grid-mode').click();});
try {
 const data=await api('/api/catalog');state.items=data.items.filter(item=>item.local||item.model);state.reviews=data.reviews;
 $('local-count').textContent=t(isPublic?'{count} моделей в IPFS':'{count} моделей на диске',{count:number(state.items.filter(i=>i.local).length)});
 $('collection-count').textContent='';
 renderGrid();let requested;try{requested=decodeURIComponent(location.hash.slice(1));}catch{}const initial=state.items.find(i=>i.key===requested)||state.filtered[0];if(initial)select(initial);
}catch(error){$('grid').innerHTML=`<div class="empty"><h2>${t('Библиотека недоступна')}</h2><p>${escape(error.message)}</p><button onclick="location.reload()">${t('Повторить')}</button></div>`;}
