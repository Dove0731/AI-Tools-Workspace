# 金蝶云星空只读 MCP 连接

## 当前结论

2026-07-28 已通过金蝶 WebAPI 登录验证：

- 私有云：`http://39.98.44.53/k3cloud/`
- 数据中心：`2023七遇集团`（ID：`64464dd5f498e6`）
- 账号：曾德炜
- 返回：`LoginResultType = 1`
- 状态：连接已验收；业务查询待用 1—3 张采购订单核验
- 本次连接测试未读取业务单据、未执行写入

连接器已限定为第一期的 6 个只读工具：

| 工具 | 状态 |
|---|---|
| `test_connection` | 开放 |
| `query_purchase_orders` | 开放 |
| `query_purchase_receipts` | 开放 |
| `query_inventory` | 开放 |
| `query_suppliers` | 开放 |
| `query_materials` | 开放 |

未实现且不暴露：新增采购订单、审核、反审核、删除、付款。

## 首次配置

在 PowerShell 中运行：

```powershell
& 'E:\新AI工具人\07_AI工作区\金蝶MCP连接\setup_connection.ps1'
```

手动输入以下内容：

1. 企业私有云金蝶访问根地址，例如 `https://erp.example.com`；
2. 现有数据中心/账套 ID；
3. 接口账号（默认“曾德炜”）；
4. `lcid`（默认中文 `2052`）；
5. 密码。

`https://openapi.open.kingdee.com/ApiDoc` 是接口文档地址，不能作为企业
WebAPI 服务地址。

密码不会写入 `config.json`，而是通过 PowerShell `Export-Clixml` 使用
Windows 当前用户凭据加密保存。不要复制或提交 `credential.clixml`。

当前已完成首次配置和 `test_connection` 验收。更换服务器、数据中心或账号时，
再重新运行配置脚本。

## 查询安全边界

- 每次查询最多 200 行，默认 50 行；
- 只调用登录验证和 `ExecuteBillQuery`；
- 不调用保存、暂存、提交、审核、反审核、删除或付款类 WebAPI；
- 默认字段可能因企业表单定制而不同，首次业务查询后需根据返回错误校正字段；
- 当前没有测试订单，不能把“登录成功”写成“采购数据查询已验收”。

## 自检

```powershell
& 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' `
  'E:\新AI工具人\07_AI工作区\金蝶MCP连接\test_server.py'
```
