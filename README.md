# Northgate Claims · 车险报案 H5

根据 `claim-h5-v6.html` 原型实现的完整移动端报案流程（Collision FNOL）。纯静态 H5，无需构建，地图使用 Google Maps JavaScript API。

## 流程

1. **Where is the car** — Google Maps 拖动地图选点 / 地址搜索 / GPS 定位，反向地理编码得到地址
2. **Add three photos** — 调用手机相机或相册，客户端压缩后生成 3 张必传照片（车头、车尾、受损部位）
3. **Check the details** — 保单信息带入、逐项可编辑、VIN 与保单号锁定、日期时间选择、勾选确认
4. **Filed** — 生成理赔号回执，支持复制理赔号；刷新页面不会重复提交

浏览器返回键、页面转场、权限引导、演示地图、错误提示均已处理。

## 本地运行

```bash
cd path/to/车险H5
python3 -m http.server 4173
```

打开 <http://localhost:4173>。手机预览建议用同一局域网的 IP 访问；摄像头/定位需要 **HTTPS 或 localhost** 才是安全上下文。

> 修改 `js/` 或 `css/` 后，请把 `index.html` 里的 `?v=1.3.1` 改成新的版本号（或强制刷新），避免浏览器继续使用缓存。

## 配置 Google Maps

编辑 [`js/config.js`](js/config.js)：

```js
googleMapsApiKey: 'YOUR_KEY',
```

在 Google Cloud Console 中：

1. 启用 **Maps JavaScript API**、**Places API (New)**、**Geocoding API**
2. 给 API Key 设置 HTTP referrer 限制（你的 H5 域名）和 API 限制
3. 确认已绑定结算账号

不填 Key 时自动进入 **Demo map** 模式：地图为原型同款静态底图，可拖动、可搜索内置地点，完整流程仍可走通，便于 UI 走查。填入 Key 后自动切换到真实 Google 地图（含 Places 自动补全、反向地理编码）。

临时预览也可以不修改代码：在 Demo 地图左下角点击 **Demo map · Connect**，粘贴 Key，保存在当前浏览器（`localStorage` 的 `ng.mapsKey.v1`）并自动刷新。`config.js` 中的 Key 优先级更高，适合正式发布；浏览器里保存的 Key 只对本机生效。

如果 Key 无效/未开通 API，页面会捕获 `gm_authFailure` 与地图错误面板并降级到 Demo map，同时在控制台打印原因。

## 接入理赔接口

同样在 [`js/config.js`](js/config.js)：

```js
apiBase: 'https://api.example.com',
endpoints: {
  policy: '/fnol/policy',
  claims: '/fnol/claims'
}
```

`apiBase` 留空时使用内置 mock 保单与模拟提交（约 1.2s，生成 `FN-年份-6位数字`）。

### GET `/fnol/policy?policy=<id>&token=<token>`

返回（字段名支持原型中的 camelCase 写法）：

```json
{
  "policyNumber": "CA-4471-8829",
  "insured": {
    "name": "Daniel Reyes",
    "phone": "+1 (650) 555-0142",
    "email": "daniel.reyes@example.com"
  },
  "vehicle": {
    "vin": "4T1B11HK5KU123456",
    "year": 2019,
    "make": "Toyota",
    "model": "Camry LE",
    "color": "Silver",
    "plate": "8KDL294",
    "state": "California",
    "stateCode": "CA"
  }
}
```

链接参数：`?policy=CA-4471-8829&token=...`，两者都会原样带给接口。

### POST `/fnol/claims`

`multipart/form-data`：

- `payload` — JSON 字符串（见下）
- `photos` — 最多 3 个文件，文件名前缀为槽位：`w1-*`、`w2-*`、`i1-*`

```json
{
  "policyNumber": "CA-4471-8829",
  "token": "一次性链接 token",
  "clientClaimNumber": "FN-2026-419263",
  "contact": { "name": "...", "phone": "...", "email": "..." },
  "vehicle": { "vin": "...", "plate": "...", "state": "California", "make": "Toyota", "model": "Camry LE", "color": "Silver" },
  "incident": {
    "date": "2026-11-10",
    "time": "11:45",
    "location": { "address": "1265 El Camino Real, Menlo Park, CA 94025", "lat": 37.45305, "lng": -122.18173 }
  },
  "photos": [{ "slot": "w1", "name": "IMG_0001.jpg", "type": "image/jpeg" }],
  "consent": true,
  "submittedAt": "2026-11-10T19:45:00.000Z",
  "meta": { "locale": "en-US", "userAgent": "..." }
}
```

返回：

```json
{ "claimNumber": "FN-2026-118442" }
```

`clientClaimNumber` 是客户端预生成的理赔号，重试时不变，可作为幂等键；接口返回自己的 `claimNumber` 时以接口为准。

跨域时服务端需允许 `credentials`（请求带 cookie），并允许 `Content-Type: multipart/form-data`。

## 接入智能体平台异步任务（短信 → H5 → 回调）

对应平台文档里的「异步任务」节点：平台先调用短信服务，短信服务把带一次性 token 的 H5 链接发给客户；客户在 H5 填完并提交后，H5 调用平台回调，工作流从等待点继续。当前按 demo 的格式提交（`code: 0`、`message: "ok"`），`data` 先只回传 `plate` 做联调测试。

### 整体链路

```
Agent 工作流
  │  异步任务节点：POST https://sms.example.com/send?token=<平台自动追加>
  │  body: { phone, h5BaseUrl, ... }
  ▼
短信服务
  │  1. 从请求 URL 读取 token
  │  2. 组装 H5 链接：/#where?token=<token>
  │  3. 同步返回 {"code":200,"message":"success"}
  ▼
客户手机 · H5 链接
  │  填写定位 / 照片 / 信息，点击 Submit
  ▼
H5 → POST https://fnol-claims-h5.vercel.app/api/async/callback?token=<token>
     {"code":0,"message":"ok","data":{"plate":"8KDL294"}}
  ▼
Vercel Function → 平台回调 → Trigger → 工作流继续
```

### 1. 异步任务节点

请求地址填你的短信服务接口（不是 H5 地址），平台会自动在这个地址后追加 `?token=...`。请求体按短信服务需要传：

```json
{
  "phone": "{{customer_phone}}",
  "h5BaseUrl": "https://fnol-claims-h5.vercel.app/",
  "policy": "{{policy_number}}"
}
```

短信服务必须**同步返回** `{"code":200,"message":"success"}`，否则平台会认为异步任务提交失败（见文档中的“外部服务响应”）。短信是否真正发送成功，由短信服务自己处理。

回调地址不需要由短信服务动态传：H5 固定调用自己域名下的 `/api/async/callback`，由 Vercel Function 转发到平台（见第 5 节）。

### 2. 短信里的 H5 链接

短信服务从收到的请求 URL 里取 `token`，拼成：

```
https://fnol-claims-h5.vercel.app/#where?token={{urlencode(token)}}
```

token 放在 `#` 后面，浏览器不会把它发给服务器，因此不会出现在 Vercel/nginx 访问日志里。H5 在启动时会读取它、写入 `sessionStorage`，然后立即把地址栏改回 `#where`；刷新页面仍能取到。

H5 支持的链接参数：

| 参数 | 说明 |
| --- | --- |
| `#where?token=...` | 异步回调 token，必填；排在 hash 路由后面 |
| `asyncToken`（普通 query） | 可选，给不便使用 hash 的自定义链接 |
| `policy` / `policyNumber` | 保单号，沿用原保单接口 |
| `token`（普通 query） | 原保单接口的一次性 token，**不是**异步 token |
| `callback` / `cb` | 可选，仅用于本地测试时覆盖回调地址 |

> 异步 token 不要放在普通 `?token=` 里，否则会和保单接口的 token 冲突。短信里的链接请按上面的格式把异步 token 放在 hash 里。

换域名或本地测试时，可以在普通 query 里加 `callback` 覆盖固定回调地址；生产环境不带这个参数，直接使用 [`js/config.js`](js/config.js) 里的 `asyncCallbackUrl`。

### 3. 提交时的回调

H5 在客户点击 **Submit claim** 后发送：

```http
POST https://fnol-claims-h5.vercel.app/api/async/callback?token=<token>
Content-Type: application/json
```

Body：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "plate": "8KDL294"
  }
}
```

当前联调阶段 `data` 只保留 `plate`；`latitude / longitude / address / claimNumber / name / photoCount` 已从回调数据中移除。完整理赔信息仍提交到 `POST /fnol/claims`，后续需要再把字段加回 `js/app.js` 的 `buildCallbackData()` 即可。

On_Success 只需要配置一个映射：

| 平台变量 | 映射路径 |
| --- | --- |
| `plate` | `data.plate` |

H5 判断成功的方式：HTTP 2xx，且响应体如果是 JSON、`code` 为 `0` 或 `200`。demo 返回的是 `{"code":0,"message":"ok"}`；文档里 `code=200` 的写法也兼容。

### 4. 失败与重试

- 理赔提交成功、但回调失败：H5 停留在信息页并提示，**不会**显示已提交回执；再次点击 Submit 只重试回调，理赔号和 token 不变。
- 理赔接口本身失败：再次提交会重试理赔接口，`clientClaimNumber` 也保持不变，可作为幂等键。
- 回调成功后才进入回执页；成功后 token 会从 `sessionStorage` 清除。

### 5. Vercel 回调中转

H5 调用自己域名下的 `/api/async/callback`，不直接跨域访问平台，所以浏览器端没有 CORS 问题。中转逻辑在 [`api/async/callback.js`](api/async/callback.js)：

```
H5 → POST https://fnol-claims-h5.vercel.app/api/async/callback?token=<token>
   → Vercel Function
   → POST https://<平台域名>/api/async/callback?token=<token>
```

平台地址用 Vercel 环境变量配置：

```
AGENT_CALLBACK_URL=https://<平台域名>/api/async/callback
```

在 Vercel 项目 **Settings → Environment Variables** 里添加后重新部署。未配置时默认转发到 demo 环境 `https://agentos.resultscloud.com/api/async/callback`；正式环境请务必改成你自己的平台地址。

如果 H5 换了域名，同步修改 [`js/config.js`](js/config.js) 的 `asyncCallbackUrl`。中转函数只转发 `token` 和 JSON body，不记录 token 或用户数据。

### 6. 超时与安全

- 异步任务节点的超时时间要覆盖客户填写时间（例如 1800 秒）；超时后走 fallback 分支。
- token 是访问凭据：全程 HTTPS、短有效期/一次性、不要写日志；H5 从 hash 读取后写入 `sessionStorage`，启动后即从地址栏移除，提交成功后清除。
- 平台侧应把同一个 token 的重复回调当作同一任务处理；H5 在回调失败时允许用户用同一 token 重试。
- 当前测试只回传 `plate`。以后需要照片时，把 [`js/config.js`](js/config.js) 的 `callbackIncludePhotos` 设为 `true`，H5 会把压缩后的照片以 base64 `dataUrl` 放进 `data.photos[]`；三张图会让请求体明显变大，生产环境更建议先上传对象存储，回调只传 URL。

## 目录

```
index.html              四个步骤的页面结构
css/app.css             设计还原 + 全屏 H5 适配（安全区、键盘、桌面预览框）
js/config.js            API Key / 接口地址 / 异步回调 / 演示保单
js/icons.js             内联图标
js/api.js               保单加载、理赔提交（multipart）、异步回调、超时与错误归一化
js/map.js               Google 地图、拖动选点、Places 搜索、反向地理编码、Demo 降级
js/photos.js            相机/相册、客户端压缩、槽位管理与校验
js/details.js           信息核对表单、行内编辑、字段校验
js/app.js               路由（History）、token 捕获、提交流程、回执
api/async/callback.js   Vercel Function：转发 H5 回调到智能体平台
```

## 已处理的细节

- **安全区**：`env(safe-area-inset-*)` 适配刘海屏与 Home Indicator；`100dvh` 适配移动端地址栏
- **图片**：读取时按最长边 1600px、JPEG 0.82 压缩，避免 12MP 原图直传；HEIC/解码失败时回退原文件
- **返回**：使用 History API，浏览器返回键与页面内 Back 一致；提交后回退锁定在回执页
- **重复提交**：提交期间按钮锁定；回执写入 `sessionStorage`，刷新 `#done` 仍显示原回执
- **校验**：姓名、电话、邮箱、车牌、日期（不可晚于今天）、地点、勾选确认；错误行高亮并滚动定位
- **降级**：无 Key、Key 无效、Places/Geocoding 未开通、定位被拒绝时都有可继续的路径
- **可访问性**：进度语义、`aria-live` 地址/照片计数、键盘操作、`prefers-reduced-motion`

## 待接入

- 真实短信发送、H5 链接 token 的签发/校验由短信服务完成（H5 从 `#where?token=` 读取并带回回调）
- 部署时需要在 Vercel 设置 `AGENT_CALLBACK_URL` 指向你的平台回调地址，并重新部署；未设置时默认转发到 demo 环境
- 车牌、车型、颜色目前来自保单数据（原型标注为 Photo）；如需 OCR，可在 `js/photos.js` 选图完成后调用识别接口回填 `details.js`
- 理赔号生成、案件落库、查勘员通知均在 `POST /fnol/claims` 后端实现；异步回调只负责通知 agent 继续流程