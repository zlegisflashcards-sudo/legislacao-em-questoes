const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const ts = require(process.env.TYPESCRIPT_MODULE || "typescript");
function load(file, mocks = {}, append = "") {
  const src = readFileSync(file, "utf8") + append;
  const result = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = {exports: {}};
  new Function("require","module","exports",result)((name) => Object.hasOwn(mocks,name) ? mocks[name] : {}, mod, mod.exports);
  return mod.exports;
}
const scope = "10000000-0000-4000-8000-000000000001";
const helper = load("lib/legiscast-scope-pending.ts");
const mockGuardModule = {"@/lib/legiscast-scope-pending":helper};
const params = {params:Promise.resolve({slug:"cf"})};
for (const [name,path] of [["standalone","aluno/leis/[slug]/legiscast"],["mini","legisbot/[slug]/legiscast"]]) {
  test(name + " fail-closed before fetching or signing, but preserves ordinary paid integral route",async () => {
    let called=0;
    const full = async (request) => {
      called++;
      if (request.headers.get("Authorization") !== "Bearer fixture-paid-integral") throw Object.assign(new Error("Denied"),{status:404});
      return {audio:{id:"SYNTHETIC_FULL_ONLY"},structures:["SYNTHETIC_FULL_STRUCTURE"]};
    };
    const {GET}=load(`app/api/${path}/route.ts`,{
      ...mockGuardModule,"next/server":{NextResponse:Response},"@/lib/admin-auth":{obterAdministrador:()=>null},
      "@/lib/law-study-server":{lawStudyErrorResponse:(error)=>Response.json({message:error.message},{status:error.status})},
      "@/lib/legiscast-audios-server":{getAuthorizedLegiscastAudioForStructure:full,listAuthorizedLegiscastAudios:full},
    });
    const invoke = (query, token) => {
      const req = new Request(`https://fixture.test/audio${query}`,{headers:{Authorization:`Bearer ${token}`}});
      req.nextUrl = new URL(req.url);
      return GET(req,params);
    };
    for(const query of [`?recorte_id=${scope}`,"?recorte_id=","?recorte_id=x&recorte_id=y","?recorte_id=invalid&structure_id=150"]) {
      const res=await invoke(query,"fixture-paid-integral");
      assert.equal(res.status,403);
      assert.match(res.headers.get("cache-control"),/private.*no-store/);
      assert.doesNotMatch(await res.text(),/SYNTHETIC/);
    }
    assert.equal(called,0);
    assert.equal((await invoke("","fixture-sample-only")).status,404);
    assert.match(await (await invoke("","fixture-paid-integral")).text(),/SYNTHETIC_FULL_ONLY/);
  });
}
test("LegisCast navigation keeps scope; explicit page never mounts full player",async()=>{
  const nav=load("components/law-study-bottom-nav.tsx",{},"\nexport {href as testHref};");
  assert.equal(nav.testHref("cf","legiscast","/legiscast",scope),`/estudar/lei/cf/legiscast?recorte_id=${scope}`);
  assert.equal(nav.testHref("cf","lei_interativa","",scope),`/legisbot/cf?recorte_id=${scope}`);
  assert.equal(nav.testHref("cf","legiscast","/legiscast",null),"/estudar/lei/cf/legiscast");
  const element=(type,props)=>({type,props});
  const {default:page}=load("app/estudar/lei/[slug]/legiscast/page.tsx",{
    "react/jsx-runtime":{jsx:element,jsxs:element},
    "@/components/law-legiscast-page-client":{LawLegiscastPageClient:"FULL_PLAYER"},
    "@/components/law-study-bottom-nav":{LawStudyBottomNav:"NAV"},
  });
  for(const recorte_id of [scope,"",[scope,"second"]]) {
    const view=JSON.stringify(await page({...params,searchParams:Promise.resolve({recorte_id})}));
    assert.match(view,/LegisCast do recorte/);
    assert.doesNotMatch(view,/FULL_PLAYER/);
  }
  assert.match(JSON.stringify(await page({...params,searchParams:Promise.resolve({})})),/FULL_PLAYER/);
});
