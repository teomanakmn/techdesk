import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { beforeAll, afterAll, beforeEach, afterEach, test, expect } from 'vitest'
import bcrypt from 'bcryptjs'

let db
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ADMIN = id(1), STAFF = id(2), USER = id(3), OTHER = id(4), ASSET = id(101), TICKET = id(201)
const as = async (user, role = 'authenticated', session = user) => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user, session_id: session, role })])
  await db.exec(`set role ${role}`)
}
const root = async sql => { await db.exec('reset role'); return db.query(sql) }
const rpc = async (name, args) => (await db.query(`select public.${name}(${args.map((_,i) => '$'+(i+1)).join(',')}) as result`, args)).rows[0].result
const payload = (request = id(301), asset = ASSET) => ({ request_id: request, asset_id: asset, title: 'Synthetic ticket', description: 'Synthetic problem', priority: 'medium' })

beforeAll(async () => {
  db = new PGlite()
  await db.exec(readFileSync('tests/auth-bootstrap.sql','utf8'))
  for (const file of readdirSync('supabase/migrations').sort()) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  await db.exec(readFileSync('supabase/seed.sql', 'utf8'))
  await db.exec('insert into auth.sessions(id,user_id) select id,id from auth.users')
})
afterAll(async () => { await db?.close() })
beforeEach(async () => { await db.exec('reset role; begin') })
afterEach(async () => { await db.exec('rollback; reset role') })

test('versioned migration and seed initialize all nine RLS tables and synthetic Auth fixtures', async () => {
  const tables = (await db.query("select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r'")).rows
  expect(tables).toHaveLength(9)
  expect(tables.every(t => t.relrowsecurity)).toBe(true)
  const users = (await db.query('select * from auth.users')).rows
  expect(users).toHaveLength(4)
  expect(users.every(u => u.email.endsWith('@techdesk.example'))).toBe(true)
  expect(bcrypt.compareSync('TechDesk-local-only-2026!', users[0].encrypted_password)).toBe(true)
})
test('signup metadata cannot grant admin', async () => {
  await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [id(9),'synthetic@techdesk.example',{full_name:'Synthetic',role:'admin'}])
  expect((await db.query('select role from profiles where id=$1',[id(9)])).rows[0].role).toBe('user')
})
test('anon has no table access or admin RPC execution', async () => {
  await as(null,'anon')
  await expect(db.query('select * from public.tickets')).rejects.toMatchObject({code:'42501'})
})
test('anon cannot invoke admin RPC', async () => {
  await as(null,'anon')
  await expect(rpc('admin_update_user_role',[USER,'admin'])).rejects.toMatchObject({code:'42501'})
})
test('ordinary user cannot list staff profiles through RPC', async () => {
  await as(USER)
  await expect(rpc('admin_list_profiles',[{}])).rejects.toMatchObject({code:'42501'})
})
test('ordinary user cannot promote self via RPC', async () => {
  await as(USER)
  await expect(rpc('admin_update_user_role',[USER,'admin'])).rejects.toMatchObject({code:'42501'})
})
test('direct profile role writes are forbidden', async () => {
  await as(USER)
  await expect(db.query("update profiles set role='admin' where id=$1",[USER])).rejects.toMatchObject({code:'42501'})
})
test('admin demotion to user persists and immediately removes staff powers', async () => {
  await as(ADMIN)
  const result = await rpc('admin_update_user_role',[STAFF,'user'])
  expect(result.role).toBe('user')
  await as(STAFF)
  expect((await db.query('select role from profiles where id=$1',[STAFF])).rows[0].role).toBe('user')
  await expect(rpc('admin_list_profiles',[{}])).rejects.toMatchObject({code:'42501'})
})
test('last administrator cannot be demoted', async () => {
  await as(ADMIN)
  await expect(rpc('admin_update_user_role',[ADMIN,'user'])).rejects.toMatchObject({code:'42501'})
})
test('ordinary users cannot read other protected records', async () => {
  await as(USER)
  for (const [table,field] of [['profiles','id'],['tickets','user_id'],['assets','assigned_to'],['ratings','user_id'],['notifications','user_id']]) {
    const { rows } = await db.query(`select * from ${table}`)
    expect(rows.every(row => row[field] === USER)).toBe(true)
  }
  expect((await db.query('select * from comments')).rows.every(row => row.ticket_id === TICKET)).toBe(true)
  expect((await db.query('select * from logs')).rows).toHaveLength(0)
})
test('ordinary user cannot insert assets', async () => {
  await as(USER)
  await expect(db.query("insert into assets(name,serial_number) values('Spoof','SPOOF')")).rejects.toMatchObject({code:'42501'})
})
test('ordinary user cannot publish announcements', async () => {
  await as(USER)
  await expect(db.query("insert into announcements(title,content) values('Spoof','Spoof')")).rejects.toMatchObject({code:'42501'})
})
test('ordinary user cannot write staff comments or audit records', async () => {
  await as(USER)
  await expect(db.query("insert into comments(ticket_id,user_id,content) values($1,$2,'spoof')",[TICKET,USER])).rejects.toMatchObject({code:'42501'})
})
test('ordinary user cannot forge notifications', async () => {
  await as(USER)
  await expect(db.query("insert into notifications(user_id,title,body) values($1,'spoof','spoof')",[OTHER])).rejects.toMatchObject({code:'42501'})
})
test('notification ownership cannot be changed', async () => {
  await as(USER)
  await expect(db.query('update notifications set user_id=$1',[OTHER])).rejects.toMatchObject({code:'42501'})
})
test('notification updates affect only own records', async () => {
  await as(USER)
  const changed = await db.query('update notifications set is_read=true returning user_id')
  expect(changed.rows.length).toBeGreaterThan(0)
  expect(changed.rows.every(row => row.user_id === USER)).toBe(true)
})
test('users cannot create tickets on another account asset', async () => {
  await as(OTHER)
  await expect(rpc('create_ticket',[payload()])).rejects.toMatchObject({code:'42501'})
})
test('ticket create atomically faults asset and logs once, including duplicate request', async () => {
  await as(USER)
  const first = await rpc('create_ticket',[payload()])
  const retry = await rpc('create_ticket',[payload()])
  expect(retry.id).toBe(first.id)
  expect((await db.query('select status from assets where id=$1',[ASSET])).rows[0].status).toBe('Arizali')
  expect((await root(`select * from logs where action='ticket_created' and target_id='${first.id}'`)).rows).toHaveLength(1)
})
test('an idempotency ID cannot conceal changed ticket input', async () => {
  await as(USER)
  await rpc('create_ticket',[payload()])
  await expect(rpc('create_ticket',[{...payload(),title:'Different'}])).rejects.toMatchObject({code:'22023'})
})
test('a failed create leaves no ticket, fault, or audit side effects', async () => {
  await db.exec('savepoint failure')
  await as(USER)
  await expect(rpc('create_ticket',[{...payload(), priority:'invalid'}])).rejects.toMatchObject({code:'23514'})
  await db.exec('rollback to savepoint failure; reset role')
  expect((await db.query('select * from tickets where request_id=$1',[id(301)])).rows).toHaveLength(0)
  expect((await db.query("select * from logs where action='ticket_created'")).rows).toHaveLength(0)
})
test('status, note, notification, asset, and audit commit together', async () => {
  await as(STAFF)
  const previous = (await db.query('select * from tickets where id=$1',[TICKET])).rows[0]
  const result = await rpc('update_ticket_status',[TICKET,'resolved',previous.updated_at,'Synthetic solution'])
  expect(result.status).toBe('resolved')
  expect((await db.query('select status from assets where id=$1',[ASSET])).rows[0].status).toBe('Aktif')
  expect((await db.query("select * from comments where content='Synthetic solution'")).rows).toHaveLength(1)
  expect((await root(`select * from notifications where ticket_id='${TICKET}' and type='success'`)).rows).toHaveLength(1)
  expect((await root(`select * from logs where action='ticket_status_updated' and target_id='${TICKET}'`)).rows).toHaveLength(1)
})
test('one resolved ticket cannot clear an asset with other open tickets', async () => {
  await as(USER)
  const created = await rpc('create_ticket',[payload()])
  await as(STAFF)
  await rpc('update_ticket_status',[created.id,'resolved',created.updated_at,''])
  expect((await db.query('select status from assets where id=$1',[ASSET])).rows[0].status).toBe('Arizali')
})
test('admin asset edits cannot clear a fault with an open ticket', async () => {
  await as(ADMIN)
  const { rows } = await db.query("update assets set status='Aktif' where id=$1 returning status",[ASSET])
  expect(rows[0].status).toBe('Arizali')
})
test('ordinary user cannot transition ticket status', async () => {
  await as(USER)
  const previous = (await db.query('select updated_at from tickets where id=$1',[TICKET])).rows[0]
  await expect(rpc('update_ticket_status',[TICKET,'resolved',previous.updated_at,''])).rejects.toMatchObject({code:'42501'})
})
test('direct ticket updates are forbidden even to staff', async () => {
  await as(STAFF)
  await expect(db.query("update tickets set status='resolved'")).rejects.toMatchObject({code:'42501'})
})
test('stale concurrent transition cannot duplicate a comment/notification', async () => {
  await as(STAFF)
  const previous = (await db.query('select updated_at from tickets where id=$1',[TICKET])).rows[0]
  await rpc('update_ticket_status',[TICKET,'in_progress',previous.updated_at,'first'])
  await db.exec('savepoint stale')
  await expect(rpc('update_ticket_status',[TICKET,'resolved',previous.updated_at,'second'])).rejects.toMatchObject({code:'40001'})
  await db.exec('rollback to savepoint stale; reset role')
  expect((await db.query("select * from comments where content='second'")).rows).toHaveLength(0)
  expect((await db.query('select status from tickets where id=$1',[TICKET])).rows[0].status).toBe('in_progress')
})
test('failure writing a notification rolls back status, asset, note, and audit', async () => {
  await db.exec("create function private.test_failure() returns trigger language plpgsql as $$ begin raise exception 'Injected notification failure'; end $$; create trigger test_failure before insert on notifications for each row execute function private.test_failure(); savepoint failed_status")
  await as(STAFF)
  const previous = (await db.query('select * from tickets where id=$1',[TICKET])).rows[0]
  await expect(rpc('update_ticket_status',[TICKET,'resolved',previous.updated_at,'must roll back'])).rejects.toThrow('Injected notification failure')
  await db.exec('rollback to savepoint failed_status; reset role')
  expect((await db.query('select status from tickets where id=$1',[TICKET])).rows[0].status).toBe(previous.status)
  expect((await db.query("select * from comments where content='must roll back'")).rows).toHaveLength(0)
  expect((await db.query('select status from assets where id=$1',[ASSET])).rows[0].status).toBe('Arizali')
})
test('ratings cannot be forged for another users ticket', async () => {
  await as(OTHER)
  await expect(db.query('insert into ratings(ticket_id,user_id,score) values($1,$2,5)',[TICKET,OTHER])).rejects.toMatchObject({code:'42501'})
})
test('revoked sessions lose all protected reads and admin operations', async () => {
  await db.query('delete from auth.sessions where user_id=$1',[ADMIN])
  await as(ADMIN)
  expect((await db.query('select * from tickets')).rows).toHaveLength(0)
  await expect(rpc('admin_update_user_role',[USER,'admin'])).rejects.toMatchObject({code:'42501'})
})
test('Auth deletion cascades and old user tokens cannot read protected data', async () => {
  await db.query('delete from auth.users where id=$1',[OTHER])
  await as(OTHER)
  expect((await db.query('select * from tickets')).rows).toHaveLength(0)
  expect((await db.query('select * from profiles')).rows).toHaveLength(0)
})
test('Auth cascade cannot delete an admin until demoted', async () => {
  await expect(db.query('delete from auth.users where id=$1',[ADMIN])).rejects.toMatchObject({code:'42501'})
})

test('account deletion clears the derived fault of its last open ticket', async () => {
  await db.query('delete from auth.users where id=$1',[USER])
  const asset=(await db.query('select status,assigned_to from assets where id=$1',[ASSET])).rows[0]
  expect(asset.assigned_to).toBe(null)
  expect(asset.status).toBe('Aktif')
})
test('staff cannot modify administrator-only assets', async () => {
  await as(STAFF)
  const result=await db.query("update assets set name='Unauthorized' returning id")
  expect(result.rows).toHaveLength(0)
})
test('staff profile listing excludes email addresses', async () => {
  await as(STAFF)
  const profiles=await rpc('admin_list_profiles',[{}])
  expect(profiles).toHaveLength(4)
  expect(profiles.every(p=>p.email===null)).toBe(true)
})

test('exposed RPCs do not execute as definer and internal triggers cannot be called by API roles', async () => {
  const exposed=(await db.query("select proname,prosecdef from pg_proc where pronamespace='public'::regnamespace")).rows
  expect(exposed).toHaveLength(4)
  expect(exposed.every(f=>!f.prosecdef)).toBe(true)
  const internal=(await db.query("select proname, has_function_privilege('anon', oid, 'EXECUTE') as anon, has_function_privilege('authenticated', oid, 'EXECUTE') as authenticated from pg_proc where pronamespace='private'::regnamespace")).rows
  expect(internal.every(f=>!f.anon)).toBe(true)
  const callable=new Set(['current_role','admin_list_profiles','admin_update_user_role','create_ticket','update_ticket_status'])
  expect(internal.every(f=>f.authenticated===callable.has(f.proname))).toBe(true)
})
test('a user cannot rate an unresolved own ticket', async () => {
  await as(USER)
  await expect(db.query('insert into ratings(ticket_id,user_id,score) values($1,$2,5)',[TICKET,USER])).rejects.toMatchObject({code:'42501'})
})
test('ordinary users cannot write shared articles', async () => {
  await as(USER)
  await expect(db.query("insert into articles(title,content,category,author_id) values('spoof','spoof','Network',$1)",[USER])).rejects.toMatchObject({code:'42501'})
})
test('staff cannot forge article ownership', async () => {
  await as(STAFF)
  await expect(db.query("insert into articles(title,content,category,author_id) values('spoof','spoof','Network',$1)",[OTHER])).rejects.toMatchObject({code:'42501'})
})
