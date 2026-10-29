import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-auth", () => ({ obterAdministrador: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/admin-article-conflicts-server", () => ({ AdminArticleConflictError: class extends Error { constructor(public status:number,message:string,public code?:string){super(message);} } }));
import { obterAdministrador } from "./admin-auth";
import { getSupabaseServerClient } from "./supabase-server";
import { applyLawDuplicateCleanup, previewLawDuplicateCleanup } from "./admin-law-duplicate-cleanup-server";
import { DUPLICATE_CLEANUP_CONFIRMATION } from "./admin-law-duplicate-cleanup";
import { row } from "./admin-law-duplicate-cleanup.fixture";

function setup(rows=[row(1),row(2)]) {
  const rpc=vi.fn().mockResolvedValue({data:{applied:1,groups:1,reversible:true},error:null});
  const ranges:number[]=[];
  const from=vi.fn((table:string)=>{
    const q:Record<string,unknown>={};
    for(const key of ["select","eq","order"])q[key]=vi.fn(()=>q);
    q.maybeSingle=vi.fn(async()=>({data:table==="leis"?{id:1,slug:"l8429",titulo:"L8429"}:null,error:null}));
    q.range=vi.fn(async(start:number,end:number)=>{ranges.push(start);return {data:rows.slice(start,end+1),error:null};});
    return q;
  });
  vi.mocked(getSupabaseServerClient).mockReturnValue({from,rpc} as unknown as ReturnType<typeof getSupabaseServerClient>);
  return {rpc,ranges,rows};
}

beforeEach(()=>{vi.mocked(obterAdministrador).mockResolvedValue({id:"00000000-0000-0000-0000-000000000099"} as never);});
describe("admin whole-law cleanup service",()=>{
  it("requires authentication before read or write",async()=>{const{rpc}=setup();vi.mocked(obterAdministrador).mockResolvedValue(null);await expect(previewLawDuplicateCleanup("l8429")).rejects.toMatchObject({status:401});expect(rpc).not.toHaveBeenCalled();});
  it("requires a specific valid law",async()=>{setup();await expect(previewLawDuplicateCleanup("")).rejects.toMatchObject({status:400});});
  it("reads all pages",async()=>{const{ranges}=setup(Array.from({length:1002},(_,i)=>row(i+1)));const p=await previewLawDuplicateCleanup("l8429");expect(ranges).toEqual([0,1000]);expect(p.total).toBe(1001);});
  it("does not write while previewing",async()=>{const{rpc}=setup();await previewLawDuplicateCleanup("l8429");expect(rpc).not.toHaveBeenCalled();});
  it("rejects missing confirmation and stale token without writes",async()=>{const{rpc}=setup();const p=await previewLawDuplicateCleanup("l8429");await expect(applyLawDuplicateCleanup({law:p.law,token:p.token,confirmation:""})).rejects.toMatchObject({status:422});await expect(applyLawDuplicateCleanup({law:p.law,token:"old",confirmation:DUPLICATE_CLEANUP_CONFIRMATION})).rejects.toMatchObject({status:409});expect(rpc).not.toHaveBeenCalled();});
  it("sends only the regenerated scoped plan to the atomic RPC",async()=>{const{rpc}=setup();const p=await previewLawDuplicateCleanup("l8429");await applyLawDuplicateCleanup({law:p.law,token:p.token,confirmation:DUPLICATE_CLEANUP_CONFIRMATION});expect(rpc).toHaveBeenCalledWith("admin_deactivate_law_duplicate_questions",expect.objectContaining({p_lei_id:1,p_slug:"l8429",p_groups:[{retained_id:row(1).id,candidate_ids:[row(2).id]}]}));});
  it("reports concurrent/stale changes as not applied",async()=>{const{rpc}=setup();const p=await previewLawDuplicateCleanup("l8429");rpc.mockResolvedValueOnce({data:null,error:{code:"40001"}});await expect(applyLawDuplicateCleanup({law:p.law,token:p.token,confirmation:DUPLICATE_CLEANUP_CONFIRMATION})).rejects.toMatchObject({status:409});});
  it("does not falsely claim rollback on network errors",async()=>{const{rpc}=setup();const p=await previewLawDuplicateCleanup("l8429");rpc.mockResolvedValueOnce({data:null,error:{code:"FETCH_ERROR"}});await expect(applyLawDuplicateCleanup({law:p.law,token:p.token,confirmation:DUPLICATE_CLEANUP_CONFIRMATION})).rejects.toThrow("Não foi possível confirmar");});
  it("fails safely until migration is installed",async()=>{const{rpc}=setup();const p=await previewLawDuplicateCleanup("l8429");rpc.mockResolvedValueOnce({data:null,error:{code:"PGRST202"}});await expect(applyLawDuplicateCleanup({law:p.law,token:p.token,confirmation:DUPLICATE_CLEANUP_CONFIRMATION})).rejects.toMatchObject({code:"duplicate_cleanup_not_installed"});});
});
