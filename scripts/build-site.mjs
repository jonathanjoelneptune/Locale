import {cp,mkdir,readFile,rm,writeFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";

const outDir=process.env.LOCALE_OUT_DIR||"dist";
const build=(process.env.LOCALE_BUILD_ID||process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||Date.now().toString(36)).slice(0,12);

await rm(outDir,{recursive:true,force:true});
await mkdir(outDir,{recursive:true});
await cp("index.html",`${outDir}/index.html`);
await cp("styles",`${outDir}/styles`,{recursive:true});
await cp("src",`${outDir}/src`,{recursive:true});

let html=await readFile(`${outDir}/index.html`,"utf8");
html=html
  .replace("./styles/base.css",`./styles/base.css?v=${build}`)
  .replace("./styles/app.css",`./styles/app.css?v=${build}`)
  .replace("./src/app.js",`./src/app.js?v=${build}`)
  .replace("</head>",`<meta name="locale-build" content="${build}"></head>`);
await writeFile(`${outDir}/index.html`,html);
await writeFile(`${outDir}/404.html`,html);

execFileSync(process.execPath,["scripts/version-site-modules.mjs",outDir,build],{stdio:"inherit"});
execFileSync("bash",["-lc",`find ${outDir}/src -name '*.js' -print0 | xargs -0 -n1 node --check`],{stdio:"inherit"});

console.log(`Built Locale ${build} into ${outDir}`);
