# Northgate Claims · 车险报案 H5

根据 `claim-h5-v6.html` 原型实现的完整移动端报案流程（Collision FNOL）。纯静态 H5，无需构建，地图是内置的 California 矢量地图 —— 不需要 Google Maps API Key，也不需要联网加载地图。

## 流程

1. **Where is the car** — 在 California 地图上拖动选点 / 搜索城市与地点 / GPS 定位，显示对应位置信息
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

> 修改 `js/`、`css/` 或 `assets/` 后，请把 `index.html` 里的 `?v=1.4.2` 改成新的版本号（或强制刷新），避免浏览器继续使用缓存。

## 内置 California 地图

地图数据在 [`assets/california-map.svg`](assets/california-map.svg)（58 个县的边界、主要公路与州界），地名索引与投影参数在 [`js/ca-data.js`](js/ca-data.js)，交互引擎在 [`js/map.js`](js/map.js)。全部随 H5 一起部署，不调用任何外部地图服务。

支持的能力：

- **缩放**：右下角 `+ / −` 按钮、鼠标滚轮、双指捏合、双击、键盘 `+ / -`。缩放范围 1×–10×，始终以手势位置或地图中心为锚点。
- **拖动选点**：拖动地图，屏幕中央的固定图钉指向的位置就是选点；松手后显示最近的城市 / 县与经纬度，并启用 Next。GPS 定位只作为快捷入口，超出 California 边界会提示改用搜索或拖动。
- **地点搜索**：内置 42 个 California 城市与景点、58 个县，支持缩写（`sf`、`la`、`sd`、`sac`、`sj`）和 `纬度,经度` 坐标。选中建议后地图居中并回填地址。
- **位置信息**：本地反向查找，14 km 内取最近的主要城市、8 km 内取次要地点，否则回退到最近的县；地址始终附带经纬度，便于后台核对。

地图初始视野覆盖整个加州（`defaultCenter` 约为州地理中心），向外拖动会被限制在州界底图范围内。修改 `assets/` 或 `js/` 后请同步更新 `index.html` 里的 `?v=` 版本号。

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

对应平台文档里的「异步任务」节点：平台先调用短信服务，短信服务把带一次性 token 的 H5 链接发给客户；客户在 H5 填完并提交后，H5 调用平台回调，工作流从等待点继续。当前按 demo 的格式提交（`code: 0`、`message: "ok"`），`data` 回传 `plate`、`address`、`phone` 三个字段。

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
H5 → POST https://agents.dyna.ai/api/async/callback?token=<token>
     {"code":0,"message":"ok","data":{"plate":"8KDL294","address":"San Diego, CA","phone":"+1 (650) 555-0142"}}
  ▼
平台 Trigger → 工作流继续
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

回调地址不需要由短信服务动态传：H5 固定调用平台地址 `https://agents.dyna.ai/api/async/callback`（配置在 [`js/config.js`](js/config.js)）。

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
POST https://agents.dyna.ai/api/async/callback?token=<token>
Content-Type: application/json
```

Body：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "plate": "8KDL294",
    "address": "San Diego, CA",
    "phone": "+1 (650) 555-0142"
  }
}
```

字段说明：

| 字段 | 内容 | 来源 |
| --- | --- | --- |
| `plate` | 车牌号 | 信息核对页 |
| `address` | 地图上选定位置的地址 | Step 1 选点结果（`incident.location.address`） |
| `phone` | 客户联系电话 | 保单 / 信息核对页 |

`latitude / longitude / claimNumber / name / photoCount` 仍然不放进回调；完整理赔信息照常提交到 `POST /fnol/claims`。需要增减字段时改 `js/app.js` 的 `buildCallbackData()` 即可。

On_Success 里配置三条映射：

| 平台变量 | 映射路径 |
| --- | --- |
| `plate` | `data.plate` |
| `address` | `data.address` |
| `phone` | `data.phone` |

H5 判断成功的方式：HTTP 2xx，且响应体 JSON 的 `code` 为 `0` 或 `200`。注意平台即使返回 HTTP 200，也可能在 body 里返回错误；例如无效 token 会返回 `{"code":"400004","message":"Server 404 Error..."}`，H5 会把这种响应当作失败。

### 4. 失败与重试

- 理赔提交成功、但回调失败：H5 停留在信息页并提示，**不会**显示已提交回执；再次点击 Submit 只重试回调，理赔号和 token 不变。
- 理赔接口本身失败：再次提交会重试理赔接口，`clientClaimNumber` 也保持不变，可作为幂等键。
- 回调成功后才进入回执页；成功后 token 会从 `sessionStorage` 清除。

### 5. 平台直连与 CORS

H5 直接 POST 到平台：

```text
H5 (fnol-claims-h5.vercel.app) → https://agents.dyna.ai/api/async/callback?token=<token>
```

平台回调接口允许跨域（`OPTIONS` 返回 204，`Access-Control-Allow-Origin: *`），所以不需要 Vercel 中转。Trigger Node 里的 `{hostname}` 应填平台环境域名 `agents.dyna.ai`，不是 H5 域名。

如果以后平台收紧 CORS，或者要把回调统一收口到 H5 域名，再加一层服务端转发，并把 [`js/config.js`](js/config.js) 的 `asyncCallbackUrl` 指到转发地址。

### 6. 超时与安全

- 异步任务节点的超时时间要覆盖客户填写时间（例如 1800 秒）；超时后走 fallback 分支。
- token 是访问凭据：全程 HTTPS、短有效期/一次性、不要写日志；H5 从 hash 读取后写入 `sessionStorage`，启动后即从地址栏移除，提交成功后清除。
- 平台侧应把同一个 token 的重复回调当作同一任务处理；H5 在回调失败时允许用户用同一 token 重试。
- 当前回调只回传 `plate`、`address`、`phone`。以后需要照片时，把 [`js/config.js`](js/config.js) 的 `callbackIncludePhotos` 设为 `true`，H5 会把压缩后的照片以 base64 `dataUrl` 放进 `data.photos[]`；三张图会让请求体明显变大，生产环境更建议先上传对象存储，回调只传 URL。

## 目录

```
index.html              四个步骤的页面结构
assets/california-map.svg  内置 California 底图（县界、公路、州界）
css/app.css             设计还原 + 全屏 H5 适配（安全区、键盘、桌面预览框）
js/config.js            接口地址 / 异步回调 / 演示保单 / 地图初始视野
js/icons.js             内联图标
js/api.js               保单加载、理赔提交（multipart）、异步回调、超时与错误归一化
js/ca-data.js           地名索引、县中心与地图投影参数
js/map.js               内置地图引擎：缩放、拖动选点、搜索、本地反向地理编码
js/photos.js            相机/相册、客户端压缩、槽位管理与校验
js/details.js           信息核对表单、行内编辑、字段校验
js/app.js               路由（History）、token 捕获、提交流程、回执
```

## 已处理的细节

- **安全区**：`env(safe-area-inset-*)` 适配刘海屏与 Home Indicator；`100dvh` 适配移动端地址栏
- **图片**：读取时按最长边 1600px、JPEG 0.82 压缩，避免 12MP 原图直传；HEIC/解码失败时回退原文件
- **返回**：使用 History API，浏览器返回键与页面内 Back 一致；提交后回退锁定在回执页
- **重复提交**：提交期间按钮锁定；回执写入 `sessionStorage`，刷新 `#done` 仍显示原回执
- **校验**：姓名、电话、邮箱、车牌、日期（不可晚于今天）、地点、勾选确认；错误行高亮并滚动定位
- **降级**：内置地图不依赖网络；定位被拒绝或超出 California 时自动提示改用搜索/拖动，流程仍可走通
- **可访问性**：进度语义、`aria-live` 地址/照片计数、键盘操作、`prefers-reduced-motion`

## 待接入

- 真实短信发送、H5 链接 token 的签发/校验由短信服务完成（H5 从 `#where?token=` 读取并带回回调）
- 平台回调地址是 `https://agents.dyna.ai/api/async/callback`；换环境时改 [`js/config.js`](js/config.js) 的 `asyncCallbackUrl`
- 车牌、车型、颜色目前来自保单数据（原型标注为 Photo）；如需 OCR，可在 `js/photos.js` 选图完成后调用识别接口回填 `details.js`
- 理赔号生成、案件落库、查勘员通知均在 `POST /fnol/claims` 后端实现；异步回调只负责通知 agent 继续流程