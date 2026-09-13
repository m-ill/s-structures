import { HARNESS_VERSION, createHarnessFiles, connectionPrompt, loadHarnessPackage } from '../../agentHarness/package.js';
import {PUBLIC_SITE_URL,getDirectoryConnection} from '../../agentHarness/directory.js';

export function createHarnessTools({tool,object}) {
  const siteUrl=PUBLIC_SITE_URL;
  const paths=[...Object.keys(createHarnessFiles(siteUrl)),'.sstructures/harness/check.mjs','install.mjs'];
  return [
    tool('get_agent_harness','Read the AI project bootstrap manifest and instructions. Does not install files, connect a local folder, modify the model or grant engineering approval.',object(),true,()=>({
      version:HARNESS_VERSION,siteUrl,files:paths,directoryPreparation:getDirectoryConnection(),prompt:connectionPrompt(siteUrl),
      installation:'Read every file using read_agent_harness_file. Assemble harness-package.json as {version,files} (exclude install.mjs); save install.mjs beside it in a temporary directory. Review contents. Run node install.mjs --target <current-project-folder> for a preview, then --apply within user-authorized scope. Never overwrite existing files. Existing entrypoints require explicit reading/link review.',
      installed:false,connectionVerified:false,designTransferAllowed:false,
    })),
    tool('read_agent_harness_file','Read one allowlisted UTF-8 bootstrap file. Files are templates, not confirmed project data. No filesystem writes or model changes.',object({path:{type:'string',enum:paths}},['path']),true,async({path})=>{
      const bundle=await loadHarnessPackage({siteUrl});
      return {version:bundle.version,path,content:path==='install.mjs'?bundle.installer:bundle.files[path]};
    }),
  ];
}
