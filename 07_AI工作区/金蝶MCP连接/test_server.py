import json
import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import kingdee_mcp_server as server


class FakeClient:
    def login(self):
        return {"connected": True, "message": "ok"}

    def query(self, name, **kwargs):
        return {"name": name, "args": kwargs, "read_only": True}


class ServerTests(unittest.TestCase):
    def test_only_six_read_only_tools_are_exposed(self):
        names = {tool["name"] for tool in server.TOOLS}
        self.assertEqual(
            names,
            {
                "test_connection",
                "query_purchase_orders",
                "query_purchase_receipts",
                "query_inventory",
                "query_suppliers",
                "query_materials",
            },
        )
        for forbidden in (
            "create_purchase_order",
            "audit_document",
            "unaudit_document",
            "delete_document",
            "payment_operation",
        ):
            self.assertNotIn(forbidden, names)

    def test_docs_url_is_rejected(self):
        with self.assertRaises(server.ConfigurationError):
            server.KingdeeClient(
                {
                    "base_url": "https://openapi.open.kingdee.com/ApiDoc",
                    "acct_id": "x",
                    "username": "u",
                },
                "p",
            )

    def test_k3cloud_path_is_not_duplicated(self):
        client = server.KingdeeClient(
            {
                "base_url": "http://39.98.44.53/k3cloud/",
                "acct_id": "x",
                "username": "u",
            },
            "p",
        )
        self.assertEqual(client.service_base_url, "http://39.98.44.53/k3cloud")

    @patch.object(server, "load_client", return_value=FakeClient())
    def test_test_connection_dispatch(self, _mock):
        response = server.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": "test_connection", "arguments": {}},
            }
        )
        self.assertFalse(response["result"]["isError"])

    @patch.object(server, "load_client", return_value=FakeClient())
    def test_forbidden_tool_is_rejected(self, _mock):
        response = server.handle_request(
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {"name": "audit_document", "arguments": {}},
            }
        )
        self.assertTrue(response["result"]["isError"])

    def test_stdio_initialize_and_tools_list(self):
        script = Path(server.__file__)
        payload = "\n".join(
            [
                json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}),
                json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}),
                "",
            ]
        )
        process = subprocess.run(
            [sys.executable, str(script)],
            input=payload,
            text=True,
            encoding="utf-8",
            capture_output=True,
            check=True,
            env={**os.environ, "PYTHONUTF8": "1"},
        )
        lines = [json.loads(line) for line in process.stdout.splitlines()]
        self.assertEqual(lines[0]["result"]["serverInfo"]["name"], "kingdee-readonly")
        self.assertEqual(len(lines[1]["result"]["tools"]), 6)


if __name__ == "__main__":
    unittest.main()
