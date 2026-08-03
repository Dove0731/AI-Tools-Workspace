"""外部数据接入预留层。

第一阶段只读取项目目录内的 Excel 文件。后续接 ERP/数据库时：
1. 在本文件新增对应连接器；
2. 返回与标准字段一致的 pandas.DataFrame；
3. 在 main.py 的 load_all_sources() 中按 source_mode 调用。
业务计算、异常规则和报告模块无需重写。
"""

from __future__ import annotations

from typing import Dict

import pandas as pd


def load_erp_data(config: dict) -> Dict[str, pd.DataFrame]:
    """ERP 接口占位。正式启用前必须补充鉴权、分页、重试和审计日志。"""
    raise NotImplementedError("ERP 接口尚未配置；当前 source_mode 应保持 Excel。")


def load_database_data(config: dict) -> Dict[str, pd.DataFrame]:
    """数据库接口占位。正式启用前必须使用只读账号并配置参数化查询。"""
    raise NotImplementedError("数据库接口尚未配置；当前 source_mode 应保持 Excel。")

