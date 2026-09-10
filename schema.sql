-- Chee Seong VIP System 数据库结构
-- 使用方式：Supabase 项目建好后，打开左侧 SQL Editor，粘贴本文件全部内容执行一次

create extension if not exists "pgcrypto";

-- 1. 会员主表
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  member_code text unique not null,
  name text not null,
  ic text,
  phone text not null,
  referrer text,
  register_date date not null,
  payment_method text,
  created_by text not null, -- 谁注册的这个会员（不用密码登入，靠员工自己填名字，方便日后追查）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_members_phone on members (phone);
create index if not exists idx_members_member_code on members (member_code);

-- 2. 每月菜品领取记录（只在实际领取时才插入一行；没领取的月份不需要预先建行，
--    有没有领取以及有没有过期都由 getDishStatus() 纯函数在前端即时算出）
create table if not exists monthly_redemptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  dish_month int not null check (dish_month between 1 and 12),
  redeemed_at timestamptz not null default now(),
  redeemed_by text not null, -- 核销员工的名字，没有密码登入，靠这个栏位追查是谁核销的
  -- period = 该次领取所属的会员周年周期起始日（例如 "2026-04-08"），
  -- 用于续会后重置名额时区分批次，逻辑与 getCycleStart() 共用
  period date not null,
  created_at timestamptz not null default now(),
  unique (member_id, dish_month, period)
);

create index if not exists idx_monthly_redemptions_member on monthly_redemptions (member_id);

-- 3. 一次性福利领取记录
create table if not exists special_redemptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  benefit_type text not null check (benefit_type in ('RM10','RM20','RM30','BirthdayCake','CNYSet','ParentsSet','MidAutumnSet')),
  period date not null,
  redeemed_at timestamptz not null default now(),
  redeemed_by text not null, -- 核销员工的名字
  created_at timestamptz not null default now(),
  unique (member_id, benefit_type, period)
);

create index if not exists idx_special_redemptions_member on special_redemptions (member_id);

-- 权限：不做登录系统，前端直接用 anon key 读写，开放公开读写权限
alter table members enable row level security;
alter table monthly_redemptions enable row level security;
alter table special_redemptions enable row level security;

drop policy if exists "public full access" on members;
create policy "public full access" on members for all using (true) with check (true);

drop policy if exists "public full access" on monthly_redemptions;
create policy "public full access" on monthly_redemptions for all using (true) with check (true);

drop policy if exists "public full access" on special_redemptions;
create policy "public full access" on special_redemptions for all using (true) with check (true);
