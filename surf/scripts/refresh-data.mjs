import {mkdir,writeFile,readFile} from 'node:fs/promises';
import waves from '../api/waves.js';
import tides from '../api/tides.js';
const directory=new URL('../data/',import.meta.url);
await mkdir(directory,{recursive:true});
let failed=false;
for(const [name,handler] of [['waves',waves],['tides',tides]]) {
  let status=200,payload;
  const response={setHeader(){},status(value){status=value;return this;},json(value){payload=value;return this;},send(value){payload=JSON.parse(value);return this;}};
  try {
    await handler({},response);
    if(status!==200 || !payload || payload.error) throw new Error('Upstream unavailable');
    const path=new URL(name+'.json',directory);
    const output=JSON.stringify(payload,null,2)+'\n';
    // Avoid redundant commits when the upstream data is unchanged.
    const previous=await readFile(path,'utf8').catch(()=>null);
    if(previous!==output) await writeFile(path,output);
    console.log(`${name}: valid snapshot saved`);
  } catch(error) {
    console.error(`${name}: ${error.message}; keeping previous snapshot`);
    failed=true;
  }
}
if(failed) process.exitCode=1;
