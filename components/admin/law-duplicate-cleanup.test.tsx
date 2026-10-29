// @vitest-environment jsdom
import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {LawDuplicateCleanup} from './law-duplicate-cleanup';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
const preview={law:'l8429',title:'L8429',token:'token',total:1,activeCount:2,groups:[{retained:{id:'a',ordem:'1',pergunta:'Assertiva'},candidates:[{id:'b',ordem:'2',pergunta:'Assertiva'}]}]};
let host:HTMLDivElement,root:Root;
function button(text:string){return [...host.querySelectorAll('button')].find(b=>b.textContent?.includes(text))!;}
async function click(text:string){await act(async()=>button(text).click());}
beforeEach(async()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>preview}));await act(async()=>root.render(<LawDuplicateCleanup law="l8429"/>));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
describe('whole deck confirmation',()=>{
 it('preview is read-only and requires exact typed confirmation',async()=>{await click('Revisar todas');expect(fetch).toHaveBeenCalledTimes(1);expect(JSON.parse((vi.mocked(fetch).mock.calls[0][1] as any).body).action).toBe('previsualizar_duplicatas_baralho');expect(button('Confirmar inativação').disabled).toBe(true);expect(host.textContent).toContain('Não é exclusão definitiva');expect(host.textContent).toContain('menor UUID');});
 it('cancel clears preview without applying',async()=>{await click('Revisar todas');await click('Cancelar');expect(host.querySelector('[role=dialog]')).toBeNull();expect(fetch).toHaveBeenCalledTimes(1);});
 it('law change discards previous preview',async()=>{await click('Revisar todas');await act(async()=>root.render(<LawDuplicateCleanup law="l8069"/>));expect(host.querySelector('[role=dialog]')).toBeNull();});
 it('blocks duplicate preview requests and ignores stale response on law change',async()=>{let resolve:any;vi.mocked(fetch).mockReturnValue(new Promise(r=>resolve=r));await act(async()=>{button('Revisar todas').click();button('Revisar todas').click();});expect(fetch).toHaveBeenCalledTimes(1);await act(async()=>root.render(<LawDuplicateCleanup law="l8069"/>));await act(async()=>resolve({ok:true,json:async()=>preview}));expect(host.querySelector('[role=dialog]')).toBeNull();});
});
