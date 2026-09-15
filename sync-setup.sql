-- Google Sheet 双向同步 —— 设置一次即可
-- 使用方式：
--   1. 先把这个专案部署到 Vercel，拿到网域（例如 https://chee-seong-vip.vercel.app）
--   2. 把下面两处 <VERCEL_URL> 换成你的 Vercel 网域
--   3. 把两处 <SYNC_SECRET> 换成一个自己随便打的密码字串（要跟 Vercel 环境变量 SYNC_WEBHOOK_SECRET 一模一样）
--   4. 整份贴到 Supabase SQL Editor 执行一次
--
-- 如果 create extension pg_cron / pg_net 报错，改成去 Supabase 左侧 Database → Extensions
-- 里搜 "pg_cron" 和 "pg_net" 用开关打开，然后重新执行这份 SQL 的其余部分。

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ============ 系统 → Sheet（资料一有变动就立刻推送） ============

create or replace function notify_sheet_sync() returns trigger as $$
declare
  payload jsonb;
  v_member_code text;
  v_register_date date;
begin
  if TG_TABLE_NAME = 'members' then
    payload := jsonb_build_object(
      'table', 'members',
      'type', TG_OP,
      'record', to_jsonb(coalesce(NEW, OLD))
    );
  else
    select member_code, register_date into v_member_code, v_register_date
    from members where id = coalesce(NEW.member_id, OLD.member_id);

    payload := jsonb_build_object(
      'table', TG_TABLE_NAME,
      'type', TG_OP,
      'record', to_jsonb(coalesce(NEW, OLD)),
      'member_code', v_member_code,
      'register_date', v_register_date
    );
  end if;

  perform net.http_post(
    url := '<VERCEL_URL>/api/sync-to-sheet',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', '<SYNC_SECRET>'),
    body := payload
  );

  return coalesce(NEW, OLD);
end;
$$ language plpgsql security definer;

drop trigger if exists trg_members_sheet_sync on members;
create trigger trg_members_sheet_sync
  after insert or update or delete on members
  for each row execute function notify_sheet_sync();

drop trigger if exists trg_monthly_sheet_sync on monthly_redemptions;
create trigger trg_monthly_sheet_sync
  after insert or update or delete on monthly_redemptions
  for each row execute function notify_sheet_sync();

drop trigger if exists trg_special_sheet_sync on special_redemptions;
create trigger trg_special_sheet_sync
  after insert or update or delete on special_redemptions
  for each row execute function notify_sheet_sync();

-- ============ Sheet → 系统（每 5 分钟轮询一次，抓手动改的儲存格） ============

select cron.schedule(
  'poll-sheet-sync',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := '<VERCEL_URL>/api/poll-sheet',
    headers := jsonb_build_object('x-sync-secret', '<SYNC_SECRET>')
  );
  $$
);

-- ============ 每天标记已作废的空白格子（系统 → Sheet，写"作废"两个字） ============
-- "已作废"是时间到了自然发生的状态，没有资料库事件可以触发，只能定时扫描。
-- 00:30 (Asia/Kuala_Lumpur) = 16:30 UTC 前一天

select cron.schedule(
  'mark-expired-dishes',
  '30 16 * * *',
  $$
  select net.http_post(
    url := '<VERCEL_URL>/api/mark-expired',
    headers := jsonb_build_object('x-sync-secret', '<SYNC_SECRET>')
  );
  $$
);
