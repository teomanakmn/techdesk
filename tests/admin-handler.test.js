import { test, expect, vi } from 'vitest'
import { createAdminHandler } from '../supabase/functions/admin-users/handler'
const ADMIN='00000000-0000-4000-8000-000000000001', USER='00000000-0000-4000-8000-000000000009'
const request = (body, token='synthetic-token',origin='http://localhost:5173') => new Request('http://local/admin-users', {
  method:'POST', headers:{...(token ? {authorization:`Bearer ${token}`} : {}),origin,'Content-Type':'application/json'}, body:JSON.stringify(body),
})
const account = {action:'create',email:'synthetic@techdesk.example',password:'Synthetic-only-password!',fullName:'Synthetic Person',role:'user'}
function setup({ role='admin', getUserError=null, rpcError=null, deleteError=null, targetRole='user' }={}) {
  const createUser=vi.fn().mockResolvedValue({data:{user:{id:USER}},error:null})
  const deleteUser=vi.fn().mockResolvedValue({error:deleteError})
  const adminClient=vi.fn(() => ({auth:{admin:{createUser,deleteUser}}}))
  const caller = { auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:ADMIN}},error:getUserError})},
    from: () => { let id; const chain={select:()=>chain,eq:(_,value)=>{id=value;return chain},single:async()=>({data:{id,role:id===ADMIN?role:targetRole},error:null})};return chain },
    rpc:vi.fn().mockResolvedValue({data:{id:USER,role:'user'},error:rpcError}) }
  return { handler:createAdminHandler({callerClient:()=>caller,adminClient,allowedOrigins:['http://localhost:5173']}),adminClient,createUser,deleteUser,caller }
}
test('anonymous request never creates a privileged client', async () => {
  const s=setup(); expect((await s.handler(request(account,null))).status).toBe(401); expect(s.adminClient).not.toHaveBeenCalled()
})
test('ordinary user cannot invoke account operations', async () => {
  const s=setup({role:'user'}); expect((await s.handler(request(account))).status).toBe(403); expect(s.adminClient).not.toHaveBeenCalled()
})
test('invalid bearer identity fails before privileged client', async () => {
  const s=setup({getUserError:new Error('invalid')}); expect((await s.handler(request(account))).status).toBe(401); expect(s.adminClient).not.toHaveBeenCalled()
})
test('unknown origin fails before any privileged operation', async () => {
  const s=setup(); expect((await s.handler(request(account,'token','https://hostile.example'))).status).toBe(403); expect(s.adminClient).not.toHaveBeenCalled()
})
test('admin creation does not change caller session and finalizes user role', async () => {
  const s=setup(); const response=await s.handler(request(account)); expect(response.status).toBe(200)
  expect(s.caller.rpc).toHaveBeenCalledWith('admin_update_user_role',{target_user_id:USER,target_role:'user'})
  expect(s.createUser.mock.calls[0][0].user_metadata).toEqual({full_name:'Synthetic Person'})
})
test('role finalization failure deletes the new ordinary account', async () => {
  const s=setup({rpcError:new Error('denied')}); expect((await s.handler(request(account))).status).toBe(409)
  expect(s.deleteUser).toHaveBeenCalledWith(USER)
})
test('failed compensation reports partial account explicitly', async () => {
  const s=setup({rpcError:new Error('denied'),deleteError:new Error('offline')}); const r=await s.handler(request(account))
  expect(r.status).toBe(500); expect(await r.json()).toMatchObject({partial:true,accountId:USER})
})
test('invalid fields fail without creating an account', async () => {
  const s=setup(); expect((await s.handler(request({...account,role:'superadmin'}))).status).toBe(400); expect(s.createUser).not.toHaveBeenCalled()
})
test('self deletion is forbidden', async () => {
  const s=setup(); expect((await s.handler(request({action:'delete',userId:ADMIN}))).status).toBe(409); expect(s.deleteUser).not.toHaveBeenCalled()
})
test('admin deletion requires prior demotion', async () => {
  const s=setup({targetRole:'admin'}); expect((await s.handler(request({action:'delete',userId:USER}))).status).toBe(409); expect(s.deleteUser).not.toHaveBeenCalled()
})
test('admin can delete an ordinary account through server Auth API', async () => {
  const s=setup(); expect((await s.handler(request({action:'delete',userId:USER}))).status).toBe(200); expect(s.deleteUser).toHaveBeenCalledWith(USER)
})
