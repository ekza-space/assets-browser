export const isPublic=window.ASSET_BROWSER?.public===true;
const storageKey='ekza-assets-reviews-v1';
let catalogue=[];
function localReviews(){try{const value=JSON.parse(localStorage.getItem(storageKey)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}}
export async function request(path,options){
 if(isPublic){
  if(path==='/api/catalog'){
   const response=await fetch(window.ASSET_BROWSER.catalogUrl||'./catalog.json');if(!response.ok)throw new Error(`Catalogue HTTP ${response.status}`);
   const data=await response.json();catalogue=data.items;return {...data,reviews:localReviews()};
  }
  if(path==='/api/reviews/export'){
   const reviews=localReviews();return {version:1,reviews,credits:catalogue.filter(i=>reviews[i.key]).map(({key,name,author,license,collection_name,source_url})=>({key,name,author,license,collection_name,source_url}))};
  }
  if(options?.method==='POST'&&path.startsWith('/api/reviews/')){
   const key=decodeURIComponent(path.slice('/api/reviews/'.length)),patch=JSON.parse(options.body);
   if(!catalogue.some(i=>i.key===key))throw new Error('Unknown asset');
   const reviews=localReviews();reviews[key]={rating:0,liked:false,...reviews[key],...patch,updated:new Date().toISOString()};
   localStorage.setItem(storageKey,JSON.stringify(reviews));return reviews[key];
  }
  throw new Error('This operation is only available in the local workspace');
 }
 const response=await fetch(path,options);const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);return data;
}
export function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
