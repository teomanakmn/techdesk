import { test, expect, vi } from 'vitest'
import { createPublicClient } from '../src/lib/clientFactory'
const key = 'synthetic.'+btoa(JSON.stringify({role:'anon'}))+'.synthetic'
test.each(['create_ticket','update_ticket_status','admin_update_user_role'])('SDK does not retry the %s mutation on 503', async rpc => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({message:'unavailable'}),{status:503,headers:{'Content-Type':'application/json'}}))
  const client = createPublicClient({url:'http://127.0.0.1:54321',key},fetch)
  const { error } = await client.rpc(rpc,{payload:{synthetic:true}})
  expect(error).toBeTruthy()
  expect(fetch).toHaveBeenCalledTimes(1)
})
test('SDK does not replay a mutation after an ambiguous network failure', async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
  const client = createPublicClient({url:'http://127.0.0.1:54321',key},fetch)
  const { error } = await client.from('articles').insert({title:'Synthetic',content:'Synthetic'})
  expect(error).toBeTruthy()
  expect(fetch).toHaveBeenCalledTimes(1)
})
