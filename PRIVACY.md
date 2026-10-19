# 隐私说明

LineTab 不收集、不存储、不传输任何个人数据。没有统计、没有遥测、没有开发者服务器。

- **设置**：默认搜索引擎、主题、风格等偏好保存在 `chrome.storage.sync`，由 Chrome 在同一个 Google 账号的设备间同步；开发者无法读取。
- **搜索词**：仅在你按下回车后，由浏览器直接提交给你选择的搜索引擎（Google、Bing 或你填写的自定义地址）。
- **权限**：只申请 `storage`。不读取浏览历史，不注入网页，不申请主机权限。
- **日志**：扩展不生成、不上传任何日志。

问题或疑问请开 issue：<https://github.com/vv721/LineTab/issues>

最后更新：2026-10-20

---

# Privacy

LineTab collects, stores, and transmits no personal data. There is no analytics, no telemetry, and no developer server.

Settings (default search engine, theme, style) are kept in `chrome.storage.sync`, synced by Chrome across devices signed into the same Google account. The developer cannot access them. Search queries are sent by your browser directly to the search engine you chose. The extension requests only the `storage` permission.
