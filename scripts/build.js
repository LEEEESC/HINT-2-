import {cp,mkdir,rm,access} from 'node:fs/promises';
await access('public/index.html');await access('api/import.js');
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});await cp('public','dist',{recursive:true});
console.log('Built static PWA into dist; API is deployed from api/import.js.');
