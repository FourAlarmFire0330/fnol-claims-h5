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

> 修改 `js/` 或 `css/` 后，请把 `index.html` 里的 `?v=1.1.1` 改成新的版本号（或强制刷新），避免浏览器继续使用缓存。

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

跨域时服务端需允许 `credentials`（请求带 cookie），并允许 `Content-Type: multipart/form-data`。

## 目录

```
index.html              四个步骤的页面结构
css/app.css             设计还原 + 全屏 H5 适配（安全区、键盘、桌面预览框）
js/config.js            API Key / 接口地址 / 演示保单
js/icons.js             内联图标
js/api.js               保单加载、理赔提交（multipart）、超时与错误归一化
js/map.js               Google 地图、拖动选点、Places 搜索、反向地理编码、Demo 降级
js/photos.js            相机/相册、客户端压缩、槽位管理与校验
js/details.js           信息核对表单、行内编辑、字段校验
js/app.js               路由（History）、权限引导、搜索交互、提交流程、回执
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

- 真实短信/邮件中的 token 校验由后端完成
- 车牌、车型、颜色目前来自保单数据（原型标注为 Photo）；如需 OCR，可在 `js/photos.js` 选图完成后调用识别接口回填 `details.js`
- 理赔号生成、案件落库、查勘员通知均在 `POST /fnol/claims` 后端实现