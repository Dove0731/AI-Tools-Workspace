import json
import os
import sys
from pathlib import Path


CONNECTOR_DIR = Path(r"E:\新AI工具人\07_AI工作区\金蝶MCP连接")
sys.path.insert(0, str(CONNECTOR_DIR))

os.environ["KINGDEE_MCP_CONFIG"] = str(CONNECTOR_DIR / "config.json")

from kingdee_mcp_server import load_client  # noqa: E402


lookup = sys.argv[1] if len(sys.argv) > 1 else "ZC-M-H-0091"

client = load_client()
client.login()
payload = {
    "CreateOrgId": 0,
    "Number": "" if lookup.isdigit() else lookup,
    "Id": lookup if lookup.isdigit() else "",
    "IsSortBySeq": False,
}
result = client._post_form(
    "Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.View",
    {
        "formid": "BD_MATERIAL",
        "data": json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
    },
)
print(json.dumps(result, ensure_ascii=False, indent=2))
