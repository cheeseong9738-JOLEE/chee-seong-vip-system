# Chee Seong VIP 会员系统

会员查询 / 注册 / 核销的正式版本，取代原本卡顿的 Google Apps Script + Google Sheet 系统。
无需登录，纯静态前端，手机/电脑都能打开。

目前完成的是第一阶段（数据库结构 + 查询/注册/核销网页 + 会员有效期与每月菜品到期逻辑）。
Google Sheet 双向同步、扫码核销、统计报表待后续迭代。

## 1. 建 Supabase 项目

1. 去 [supabase.com](https://supabase.com) 新建项目（Region 选 Southeast Asia (Singapore)）
2. 项目建好后，打开左侧 **SQL Editor**，粘贴 [`schema.sql`](./schema.sql) 的全部内容并执行一次
   - 这会建好 3 张表（members / monthly_redemptions / special_redemptions），并打开公开读写权限（不需要登录）
3. 打开 **Project Settings → API**，复制：
   - **Project URL**
   - **anon public** key（不是 `service_role`，那个是后台密钥，不能放前端）

## 2. 填入连接信息

编辑 [`config.js`](./config.js)：

```js
window.SUPABASE_URL = "https://xxxxxxxx.supabase.co";
window.SUPABASE_ANON_KEY = "eyJxxxxxxxx...";
```

保存后本地直接打开 `index.html` 就能测试（或用任意静态服务器 `npx serve .`）。

## 3. 部署到 Vercel

1. 把这个文件夹推到 GitHub（新建一个 repo）
2. 去 [vercel.com](https://vercel.com) → New Project → 选这个 repo → Framework Preset 选 **Other**（纯静态，不需要 build command）→ Deploy
3. 部署完成后打开域名即可使用，数据是所有员工共用的一份（不分账号，不需要登录）

之后每次改 `config.js` / `index.html` / `app.js` 推到 GitHub，Vercel 会自动重新部署。

## 每月菜品到期核心逻辑

不是看日历月份，而是以会员的「入会日期」为基准逐月判断，详见 [`app.js`](./app.js) 里的
`getDishStatus(registerDate, dishMonth, today, redeemed)` 纯函数：

- **入会当月**：有效期延长到明年周年日之前（不是当月月底就作废）
- **其余月份**：照日历整月计算，月底 24:00 后未使用即作废
- **尚未到达的月份**：暂不开放核销

一次性福利（RM10/20/30、生日蛋糕、CNY/父母节/中秋套餐）目前比照会员整体有效期——会员未过期就可以领。
到期规则细节、续会后名额重置逻辑待后续与 Jolee 确认。

## 文件说明

- `index.html` — 页面结构 + 样式
- `app.js` — 业务逻辑（含 `getDishStatus` 核心判断函数），数据读写用 Supabase JS client
- `config.js` — Supabase 连接信息（Project URL + anon key，本来就是给前端公开用的，不是密钥）
- `schema.sql` — 建表 + 权限设置，在 Supabase SQL Editor 跑一次即可

## 待确认事项

- 原始 ~100 笔会员资料是否要一次性导入（目前判定为都算今年份的记录）
- 一次性福利的到期规则细节（CNY/父母节/中秋是限时活动，可能需要额外的活动期限栏位）
- 会员续费后新一年的 12 个月菜品名额重置（已预留 `period` 栏位，逻辑待补）
- Google Sheet 双向同步的具体实现方式
