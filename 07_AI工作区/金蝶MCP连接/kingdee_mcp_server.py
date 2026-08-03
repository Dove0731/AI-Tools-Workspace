#!/usr/bin/env python3
"""只读的金蝶云星空 WebAPI MCP 服务。

不实现任何新增、保存、提交、审核、反审核、删除或付款接口。
仅使用 Python 标准库，便于在 Windows 私有云环境中部署。
"""

from __future__ import annotations

import http.cookiejar
import json
import os
import sys
import traceback
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


SERVER_DIR = Path(__file__).resolve().parent
CONFIG_PATH = Path(os.environ.get("KINGDEE_MCP_CONFIG", SERVER_DIR / "config.json"))
MAX_LIMIT = 200

ALLOWED_FORMS = {
    "query_purchase_orders": {
        "form_id": "PUR_PurchaseOrder",
        "fields": [
            "FID",
            "FBillNo",
            "FDate",
            "FDocumentStatus",
            "FPurchaseOrgId.FNumber",
            "FSupplierId.FNumber",
            "FSupplierId.FName",
            "FPOOrderEntry_FEntryId",
            "FMaterialId.FNumber",
            "FMaterialId.FName",
            "FQty",
            "FTaxPrice",
            "FAllAmount",
            "FDeliveryDate",
        ],
    },
    "query_purchase_receipts": {
        "form_id": "PUR_ReceiveBill",
        "fields": [
            "FID",
            "FBillNo",
            "FDate",
            "FDocumentStatus",
            "FStockOrgId.FNumber",
            "FSupplierId.FNumber",
            "FSupplierId.FName",
            "FDetailEntity_FEntryId",
            "FMaterialId.FNumber",
            "FMaterialId.FName",
            "FActReceiveQty",
        ],
    },
    "query_inventory": {
        "form_id": "STK_Inventory",
        "fields": [
            "FStockOrgId.FNumber",
            "FMaterialId.FNumber",
            "FMaterialId.FName",
            "FStockId.FNumber",
            "FLot.FNumber",
            "FBaseQty",
            "FAvailQty",
        ],
    },
    "query_suppliers": {
        "form_id": "BD_Supplier",
        "fields": [
            "FSupplierId",
            "FNumber",
            "FName",
            "FUseOrgId.FNumber",
            "FDocumentStatus",
            "FForbidStatus",
        ],
    },
    "query_materials": {
        "form_id": "BD_MATERIAL",
        "fields": [
            "FMATERIALID",
            "FNumber",
            "FName",
            "FSpecification",
            "FBaseUnitId.FNumber",
            "FUseOrgId.FNumber",
            "FDocumentStatus",
            "FForbidStatus",
        ],
    },
}

TOOLS = [
    {
        "name": "test_connection",
        "description": "只验证金蝶云星空 WebAPI 登录连接，不读取或修改业务单据。",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
        "annotations": {"readOnlyHint": True, "destructiveHint": False, "openWorldHint": True},
    },
]

for _tool_name, _definition in ALLOWED_FORMS.items():
    TOOLS.append(
        {
            "name": _tool_name,
            "description": f"只读查询金蝶表单 {_definition['form_id']}；最多返回 {MAX_LIMIT} 行。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "filter_string": {
                        "type": "string",
                        "description": "可选的金蝶过滤表达式；留空表示不过滤。",
                        "default": "",
                    },
                    "order_string": {
                        "type": "string",
                        "description": "可选排序表达式。",
                        "default": "",
                    },
                    "start_row": {"type": "integer", "minimum": 0, "default": 0},
                    "limit": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": MAX_LIMIT,
                        "default": 50,
                    },
                },
                "additionalProperties": False,
            },
            "annotations": {"readOnlyHint": True, "destructiveHint": False, "openWorldHint": True},
        }
    )


class ConfigurationError(RuntimeError):
    pass


class KingdeeClient:
    def __init__(self, config: dict[str, Any], password: str):
        self.base_url = str(config.get("base_url", "")).rstrip("/")
        self.acct_id = str(config.get("acct_id", "")).strip()
        self.username = str(config.get("username", "")).strip()
        self.password = password
        self.lcid = int(config.get("lcid", 2052))
        self.timeout_seconds = int(config.get("timeout_seconds", 30))
        self._validate_config()
        parsed = urllib.parse.urlparse(self.base_url)
        if parsed.path.rstrip("/").lower().endswith("/k3cloud"):
            self.service_base_url = self.base_url
        else:
            self.service_base_url = f"{self.base_url}/K3Cloud"
        self.cookie_jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cookie_jar)
        )

    def _validate_config(self) -> None:
        missing = [
            name
            for name, value in (
                ("base_url", self.base_url),
                ("acct_id", self.acct_id),
                ("username", self.username),
                ("password", self.password),
            )
            if not value
        ]
        if missing:
            raise ConfigurationError("缺少配置：" + "、".join(missing))
        parsed = urllib.parse.urlparse(self.base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ConfigurationError("base_url 必须是有效的 HTTP(S) 地址")
        if parsed.netloc.lower() == "openapi.open.kingdee.com":
            raise ConfigurationError(
                "当前地址是金蝶接口文档站，不是企业私有云 WebAPI 服务地址"
            )

    def _post_form(self, service: str, data: dict[str, Any]) -> Any:
        url = f"{self.service_base_url}/{service}.common.kdsvc"
        body = urllib.parse.urlencode(data).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Accept": "application/json",
                "User-Agent": "Codex-Kingdee-ReadOnly-MCP/1.0",
            },
            method="POST",
        )
        try:
            with self.opener.open(request, timeout=self.timeout_seconds) as response:
                raw = response.read().decode("utf-8-sig", errors="replace")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
            raise RuntimeError(f"金蝶返回 HTTP {exc.code}：{detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"无法访问金蝶服务：{exc.reason}") from exc
        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"金蝶返回的不是有效 JSON：{raw[:500]}") from exc

    def login(self) -> dict[str, Any]:
        result = self._post_form(
            "Kingdee.BOS.WebApi.ServicesStub.AuthService.ValidateUser",
            {
                "acctID": self.acct_id,
                "username": self.username,
                "password": self.password,
                "lcid": self.lcid,
            },
        )
        if not isinstance(result, dict):
            raise RuntimeError(f"登录返回格式异常：{type(result).__name__}")
        success = bool(result.get("IsSuccessByAPI")) or result.get("LoginResultType") == 1
        if not success:
            message = (
                result.get("Message")
                or result.get("MessageCode")
                or result.get("ErrorStackTrace")
                or "账号、密码、数据中心 ID 或权限不正确"
            )
            raise RuntimeError(f"金蝶登录失败：{message}")
        return {
            "connected": True,
            "server": urllib.parse.urlparse(self.base_url).netloc,
            "account": self.username,
            "lcid": self.lcid,
            "login_result_type": result.get("LoginResultType"),
            "message": "金蝶 WebAPI 登录验证成功；未读取业务单据。",
        }

    def query(
        self,
        tool_name: str,
        filter_string: str = "",
        order_string: str = "",
        start_row: int = 0,
        limit: int = 50,
    ) -> dict[str, Any]:
        definition = ALLOWED_FORMS[tool_name]
        limit = max(1, min(int(limit), MAX_LIMIT))
        start_row = max(0, int(start_row))
        self.login()
        fields = definition["fields"]
        payload = {
            "FormId": definition["form_id"],
            "FieldKeys": ",".join(fields),
            "FilterString": str(filter_string or ""),
            "OrderString": str(order_string or ""),
            "StartRow": start_row,
            "Limit": limit,
        }
        rows = self._post_form(
            "Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.ExecuteBillQuery",
            {"data": json.dumps(payload, ensure_ascii=False, separators=(",", ":"))},
        )
        if isinstance(rows, dict):
            status = rows.get("Result", {}).get("ResponseStatus", {})
            if status and not status.get("IsSuccess", False):
                errors = status.get("Errors") or []
                message = "; ".join(str(item.get("Message", item)) for item in errors)
                raise RuntimeError(f"金蝶查询失败：{message or rows}")
        if not isinstance(rows, list):
            raise RuntimeError(f"查询返回格式异常：{type(rows).__name__}")
        records = [
            dict(zip(fields, row)) if isinstance(row, list) else row
            for row in rows
        ]
        return {
            "form_id": definition["form_id"],
            "start_row": start_row,
            "limit": limit,
            "count": len(records),
            "records": records,
            "read_only": True,
        }


def load_client() -> KingdeeClient:
    if not CONFIG_PATH.exists():
        raise ConfigurationError(f"配置文件不存在：{CONFIG_PATH}")
    try:
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ConfigurationError(f"配置文件无法读取：{exc}") from exc
    return KingdeeClient(config, os.environ.get("KINGDEE_PASSWORD", ""))


def tool_result(value: Any, is_error: bool = False) -> dict[str, Any]:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, indent=2)
    return {
        "content": [{"type": "text", "text": text}],
        "isError": is_error,
    }


def handle_request(message: dict[str, Any]) -> dict[str, Any] | None:
    method = message.get("method")
    request_id = message.get("id")
    if request_id is None:
        return None
    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "kingdee-readonly", "version": "1.0.0"},
            },
        }
    if method == "ping":
        return {"jsonrpc": "2.0", "id": request_id, "result": {}}
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": request_id, "result": {"tools": TOOLS}}
    if method == "tools/call":
        params = message.get("params") or {}
        name = params.get("name")
        arguments = params.get("arguments") or {}
        try:
            client = load_client()
            if name == "test_connection":
                result = client.login()
            elif name in ALLOWED_FORMS:
                result = client.query(name, **arguments)
            else:
                raise RuntimeError(f"工具未开放：{name}")
            payload = tool_result(result)
        except Exception as exc:  # 工具错误应返回给调用方，不能中断 MCP 进程
            payload = tool_result(str(exc), is_error=True)
        return {"jsonrpc": "2.0", "id": request_id, "result": payload}
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": -32601, "message": f"Method not found: {method}"},
    }


def main() -> int:
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            message = json.loads(line.lstrip("\ufeff"))
            response = handle_request(message)
            if response is not None:
                sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
                sys.stdout.flush()
        except Exception:
            traceback.print_exc(file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
