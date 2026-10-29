// Передаём только ключ каталога; адрес модели Studio проверяет самостоятельно.
export function libraryStudioUrl(key, pageUrl) {
 const page = new URL(pageUrl);
 const local = page.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(page.hostname);
 const origin = local && page.port === '4178' ? `http://${page.hostname}:7103` : page.origin;
 const url = new URL('/studio-edit', origin);
 url.search = new URLSearchParams({libraryAsset:key}).toString();
 return url.href;
}
