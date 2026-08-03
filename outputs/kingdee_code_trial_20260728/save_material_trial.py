import json
import os
import sys
from pathlib import Path


CONNECTOR_DIR = Path(r"E:\新AI工具人\07_AI工作区\金蝶MCP连接")
sys.path.insert(0, str(CONNECTOR_DIR))
os.environ["KINGDEE_MCP_CONFIG"] = str(CONNECTOR_DIR / "config.json")

from kingdee_mcp_server import load_client  # noqa: E402


NUMBER = "ZC-M-H-0095"
NAME = "正彩测试版面膜25ml*5"


client = load_client()
client.login()

check_payload = {
    "FormId": "BD_MATERIAL",
    "FieldKeys": "FMATERIALID,FNumber,FName,FUseOrgId.FNumber,FDocumentStatus",
    "FilterString": f"FNumber='{NUMBER}' OR FName='{NAME}'",
    "OrderString": "FNumber ASC",
    "StartRow": 0,
    "Limit": 20,
}
existing = client._post_form(
    "Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.ExecuteBillQuery",
    {"data": json.dumps(check_payload, ensure_ascii=False, separators=(",", ":"))},
)
code_matches = [row for row in existing if str(row[1] or "").strip() == NUMBER]
if code_matches:
    print(
        json.dumps(
            {"aborted": True, "reason": "目标编码已存在", "records": code_matches},
            ensure_ascii=False,
            indent=2,
        )
    )
    raise SystemExit(2)

blank_code_name_matches = [
    row
    for row in existing
    if str(row[1] or "").strip() == "" and str(row[2] or "").strip() == NAME
]
if len(blank_code_name_matches) > 1:
    print(
        json.dumps(
            {
                "aborted": True,
                "reason": "同名空编码记录不唯一",
                "records": blank_code_name_matches,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    raise SystemExit(3)

target_id = int(blank_code_name_matches[0][0]) if blank_code_name_matches else 0

save_data = {
    "NeedUpDateFields": ["FNumber", "FSpecification"] if target_id else [],
    "NeedReturnFields": [
        "FMATERIALID",
        "FNumber",
        "FName",
        "FSpecification",
        "FDocumentStatus",
    ],
    "IsDeleteEntry": True,
    "SubSystemId": "",
    "IsVerifyBaseDataField": False,
    "IsEntryBatchFill": True,
    "ValidateFlag": True,
    "NumberSearch": True,
    "IsAutoAdjustField": False,
    "InterationFlags": "",
    "IgnoreInterationFlag": "",
    "Model": {
        "FMATERIALID": target_id,
        "FCreateOrgId": {"FNumber": "100"},
        "FUseOrgId": {"FNumber": "100"},
        "FNumber": NUMBER,
        "FName": NAME,
        "FSpecification": "25ml*5",
        "FMaterialGroup": {"FNumber": "CP"},
        "SubHeadEntity": {
            "FErpClsID": "3",
            "FIsInventory": True,
            "FIsSale": True,
            "FIsAsset": False,
            "FIsSubContract": True,
            "FIsProduce": True,
            "FIsPurchase": True,
            "FBaseUnitId": {"FNumber": "he"},
            "FTaxType": {"FNumber": "WLDSFL01_SYS"},
            "FCategoryID": {"FNumber": "CHLB05_SYS"},
            "FTaxRateId": {"FNumber": "SL02_SYS"},
            "FWEIGHTUNITID": {"FNumber": "kg"},
            "FVOLUMEUNITID": {"FNumber": "cm"},
            "FFeatureItem": "1",
            "FSuite": "0",
            "FCostPriceRate": 0,
        },
    },
}
result = client._post_form(
    "Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.Save",
    {
        "formid": "BD_MATERIAL",
        "data": json.dumps(save_data, ensure_ascii=False, separators=(",", ":")),
    },
)
print(json.dumps(result, ensure_ascii=False, indent=2))
