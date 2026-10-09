-- PUBLIC SYNTHETIC FIXTURES. Only for the isolated local reference project.
-- All four accounts use TechDesk-local-only-2026! (never reuse this password).
insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
  confirmation_token,recovery_token,email_change_token_new,email_change
)
select '00000000-0000-0000-0000-000000000000'::uuid, id::uuid, 'authenticated','authenticated',email,
  '$2b$10$Nl8WjXo8pkaow4MYzVIbOeAgQMxWitJsY5QXJYp.q3qeDEw/Kr2py',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,jsonb_build_object('full_name',name),now(),now(),'','','',''
from (values
  ('00000000-0000-4000-8000-000000000001','admin@techdesk.example','Synthetic Admin'),
  ('00000000-0000-4000-8000-000000000002','staff@techdesk.example','Synthetic IT Staff'),
  ('00000000-0000-4000-8000-000000000003','user@techdesk.example','Synthetic User'),
  ('00000000-0000-4000-8000-000000000004','other@techdesk.example','Synthetic Other User')
) as fixtures(id,email,name);
insert into auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
select gen_random_uuid(),id,id::text,jsonb_build_object('sub',id::text,'email',email,'email_verified',true), 'email',now(),now(),now()
from auth.users where email like '%@techdesk.example';
update public.profiles set role = 'admin' where id='00000000-0000-4000-8000-000000000001';
update public.profiles set role = 'it_staff' where id='00000000-0000-4000-8000-000000000002';

insert into public.assets(id,name,serial_number,category,status,assigned_to) values
('00000000-0000-4000-8000-000000000101','Synthetic laptop A','SYNTHETIC-001','Laptop','Arizali','00000000-0000-4000-8000-000000000003'),
('00000000-0000-4000-8000-000000000102','Synthetic monitor B','SYNTHETIC-002','Monitör','Aktif','00000000-0000-4000-8000-000000000004');
insert into public.tickets(id,user_id,asset_id,title,description,priority,status,request_id) values
('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000101','Synthetic network issue','A fictional local test issue.','medium','open','00000000-0000-4000-8000-000000000401'),
('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000102','Synthetic display issue','A fictional resolved issue.','low','resolved','00000000-0000-4000-8000-000000000402'),
('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000003',null,'Synthetic software issue','A fictional resolved issue.','low','resolved','00000000-0000-4000-8000-000000000403');
insert into public.comments(ticket_id,user_id,content) values
('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000002','Synthetic diagnostic note');
insert into public.ratings(ticket_id,user_id,score,comment) values
('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000004',4,'Synthetic feedback B'),
('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000003',5,'Synthetic feedback A');
insert into public.notifications(user_id,ticket_id,title,body) values
('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000201','Synthetic update A','Only synthetic information.'),
('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000202','Synthetic update B','Only synthetic information.');
insert into public.articles(title,content,category,author_id,source_ticket_id) values
('Synthetic troubleshooting example','A fictional reference article for the local demo.','Yazılım','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000202');
insert into public.announcements(title,content) values ('Synthetic local demo','This environment contains synthetic data only.');
