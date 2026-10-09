// Run only after resetting the isolated local reference backend and serving functions.
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const status = JSON.parse(execFileSync('node_modules/.bin/supabase',['status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
const url = status.API_URL || status.api_url
assert(url && ['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname), 'Integration tests require a loopback local backend')
const key = status.ANON_KEY || status.anon_key || status.PUBLISHABLE_KEY
assert(key, 'Local public key was not returned by Supabase status')
const client = () => createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},db:{retry:false}})
const password = 'TechDesk-local-only-2026!'
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const anon=client(),admin=client(),staff=client(),user=client(),other=client()
for (const [c,email] of [[admin,'admin'],[staff,'staff'],[user,'user'],[other,'other']]) {
  const { error } = await c.auth.signInWithPassword({email:`${email}@techdesk.example`,password})
  assert(!error, 'Synthetic local sign-in failed; reset the reference backend first')
}
let result = await anon.rpc('admin_update_user_role',{target_user_id:id(3),target_role:'admin'})
assert(result.error, 'Anonymous caller must not invoke admin RPC')
result = await user.rpc('admin_update_user_role',{target_user_id:id(3),target_role:'admin'})
assert(result.error, 'Ordinary user must not promote self')
for (const [table,column] of [['profiles','id'],['tickets','user_id'],['assets','assigned_to'],['ratings','user_id'],['notifications','user_id']]) {
  const { data,error }=await user.from(table).select('*').eq(column,id(4))
  assert(!error && data.length===0, `Other account ${table} must be hidden`)
}
result = await user.functions.invoke('admin-users',{body:{action:'delete',userId:id(4)}})
assert(result.error, 'Ordinary caller must not invoke account deletion')
result = await anon.functions.invoke('admin-users',{body:{action:'delete',userId:id(4)}})
assert(result.error, 'Anonymous caller must not invoke account deletion')

const request = crypto.randomUUID()
const payload={request_id:request,asset_id:id(101),title:'Synthetic integration ticket',description:'Synthetic only',priority:'medium'}
let ticket
try {
  const created=await user.rpc('create_ticket',{payload});assert(!created.error && created.data?.id,'Atomic ticket creation failed');ticket=created.data
  const duplicate=await user.rpc('create_ticket',{payload});assert(!duplicate.error && duplicate.data.id===ticket.id,'Creation retry must be idempotent')
  const resolved=await staff.rpc('update_ticket_status',{target_ticket_id:ticket.id,target_status:'resolved',expected_updated_at:ticket.updated_at,note:'Synthetic integration note'})
  assert(!resolved.error && resolved.data.status==='resolved','Atomic transition failed')
  const {data:notes,error:noteError}=await user.from('comments').select('*').eq('ticket_id',ticket.id)
  assert(!noteError && notes.length===1,'Transition note must persist')
  const {data:notifications,error:notificationError}=await user.from('notifications').select('*').eq('ticket_id',ticket.id)
  assert(!notificationError && notifications.length===1,'Transition notification must persist')
  result=await admin.rpc('admin_update_user_role',{target_user_id:id(2),target_role:'user'})
  assert(!result.error && result.data.role==='user','Demotion must persist')
  result=await staff.rpc('admin_list_profiles',{payload:{}})
  assert(result.error,'Demotion must apply to an already-issued JWT')
} finally {
  const restored=await admin.rpc('admin_update_user_role',{target_user_id:id(2),target_role:'it_staff'})
  assert(!restored.error,'Could not restore synthetic staff role')
}

// Exercise real Auth account management through the actual local Edge runtime.
const email=`synthetic-${crypto.randomUUID()}@techdesk.example`
let accountId
try {
  result=await admin.functions.invoke('admin-users',{body:{action:'create',email,password,fullName:'Synthetic Integration Account',role:'user'}})
  assert(!result.error && result.data?.ok,'Local Edge account creation failed');accountId=result.data.user.id
  const created=client();const signed=await created.auth.signInWithPassword({email,password})
  assert(!signed.error,'New synthetic account must sign in')
  result=await admin.functions.invoke('admin-users',{body:{action:'delete',userId:accountId}})
  assert(!result.error && result.data?.ok,'Local Edge account deletion failed');accountId=null
  const protectedRows=await created.from('profiles').select('*')
  assert(protectedRows.error || protectedRows.data.length===0,'Deleted account JWT must lose data access')
} finally {
  if(accountId) await admin.functions.invoke('admin-users',{body:{action:'delete',userId:accountId}})
  await Promise.all([admin,staff,user,other].map(c=>c.auth.signOut({scope:'local'})))
}
console.log('Local Auth/PostgREST/Edge integration passed. Synthetic integration ticket remains until next local reset.')
