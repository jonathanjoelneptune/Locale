import {readdir,readFile,writeFile} from "node:fs/promises";
import {join} from "node:path";

const [root,build]=process.argv.slice(2);
if(!root||!build)throw new Error("Usage: node scripts/version-site-modules.mjs <site-root> <build-id>");

const jsFiles=[];
async function walk(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const path=join(dir,entry.name);
    if(entry.isDirectory())await walk(path);
    else if(entry.isFile()&&entry.name.endsWith(".js"))jsFiles.push(path);
  }
}
await walk(join(root,"src"));

for(const path of jsFiles){
  const original=await readFile(path,"utf8");
  const versioned=original
    .replace(/(from\s*["'])(\.\.?\/[^"'?]+\.js)(["'])/g,(match,prefix,specifier,suffix)=>prefix+specifier+"?v="+build+suffix)
    .replace(/(import\(\s*["'])(\.\.?\/[^"'?]+\.js)(["']\s*\))/g,(match,prefix,specifier,suffix)=>prefix+specifier+"?v="+build+suffix);
  await writeFile(path,versioned);
}
console.log("Versioned "+jsFiles.length+" JavaScript modules with build "+build+".");
