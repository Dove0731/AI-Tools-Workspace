from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path


BASE_DIR = Path(r"E:\新AI工具人\outputs\019f8e6d-c460-7501-b142-ffc2dc6740a7")
OCR_DIR = BASE_DIR / "registry_card_ocr"
OUTPUT_PATH = BASE_DIR / "registry_records.json"

IMAGE_NAMES = """
codex-clipboard-210d3f46-e852-4d82-bf6f-eeeccea97372.jpg
codex-clipboard-1f7c3005-d21b-4462-b74f-441f07bcaffc.jpg
codex-clipboard-e3586664-99cb-4bf9-a666-10d996c915ba.jpg
codex-clipboard-549a5591-bd7a-4777-962f-fd7e7c0031ee.jpg
codex-clipboard-6215fa46-d2e5-4492-8847-c816e7762b65.jpg
codex-clipboard-d7b1109d-9dff-4e6f-9955-b338ff1f3859.jpg
codex-clipboard-c849d2e2-d645-4589-86b0-9d4679a2bf9b.jpg
codex-clipboard-38b14cb1-9c5b-45d4-a2fd-bb25f899dbf4.jpg
codex-clipboard-7948485c-0c2b-4b05-b71a-fd8847f25199.jpg
codex-clipboard-19c5b1b6-28d1-4f09-a003-40d1d747acfa.jpg
codex-clipboard-1158c1ae-fccc-4beb-9bbe-2bb0ade5b0db.jpg
codex-clipboard-29d715f1-a103-4941-9b97-52a8a0d1eeae.jpg
codex-clipboard-3903e511-0ebf-4335-8a8b-f81c55d2e434.jpg
codex-clipboard-861b8460-5950-4b5b-b93e-088c7d3c5c96.jpg
codex-clipboard-c97ea106-643b-4d51-8e1a-4e77c540ac3d.jpg
codex-clipboard-8ee91a27-a449-46ed-99ad-1d96e8214b31.jpg
codex-clipboard-1c9373e0-b119-4169-9997-67952e07c50b.jpg
codex-clipboard-f299eda1-9867-4033-ac70-a2ac420cb64f.jpg
codex-clipboard-8b2166da-65a9-4032-b16a-42cd4986e91b.jpg
codex-clipboard-d92ba352-5027-4e87-963a-ea19d9f4894a.jpg
codex-clipboard-a94b65bc-676a-4a78-8f48-0880911db2da.jpg
codex-clipboard-23020965-bae4-45cc-8ca2-a59055394f3c.jpg
codex-clipboard-0223abbe-5bac-44ee-a4df-51b273785e37.jpg
codex-clipboard-1274e89a-2eec-455b-8916-4bb027009836.jpg
codex-clipboard-aeb17f00-375e-4a28-9bee-6b1e8bc85610.jpg
codex-clipboard-1ee44cd5-c806-4acd-bbc7-e16d8424a10a.jpg
codex-clipboard-9f15cebd-0b4e-4171-acbb-128f66a88524.jpg
codex-clipboard-7498b99a-431c-4c9a-9fb7-0d967f4fdd7a.jpg
codex-clipboard-5adf37a4-dcdb-4781-8922-ca1a38460825.jpg
codex-clipboard-2bf4d802-abd5-4c84-a8e2-61bc58d6eb11.jpg
""".strip().splitlines()

PROVINCE_CODES = {
    "粤": "03",
    "沪": "00",
    "浙": "00",
    "京": "00",
    "湘": "00",
}

UI_PHRASES = (
    "国产普通化妆品",
    "备案查询",
    "请输入产品名称",
    "产品关键词",
    "搜索",
    "非特品类",
    "非特功效",
    "正在加载中",
    "数据由化妆品监管提供",
)

OCR_FIXES = (
    ("ANT卜", "ANTI-"),
    ("ANT 卜", "ANTI-"),
    ("F凵RTSHADE", "FLIRTSHADE"),
    ("F 凵 RTSHADE", "FLIRTSHADE"),
    ("TU凵LABS", "TULLABS"),
    ("TU 凵 LABS", "TULLABS"),
    ("CoIIagen", "Collagen"),
    ("VaniIIa", "Vanilla"),
    ("l00ML", "100ML"),
)

MANUAL_OVERRIDES = {
    (3, 2): {"registration_number": "国妆网备进字（沪）2026003870"},
    (1, 3): {"registration_number": "国妆网备进字（沪）2026003339"},
    (1, 18): {
        "product_name": "梵璞丽安达曼海芳香沐浴洗手液",
        "registration_number": "国妆网备进字（沪）2026004059",
    },
    (14, 10): {"registration_number": "粤G妆网备字2026233762"},
    (14, 1): {
        "product_name": "Dr.Mnoqij润妍角质层霜",
        "registration_number": "粤G妆网备字2026227338",
    },
    (14, 7): {"registration_number": "苏G妆网备字2026003397"},
    (16, 8): {
        "registration_number": "粤G妆网备字2026202033",
        "registrant_company": "汕头市雅威健美肤化学厂有限公司",
    },
    (16, 14): {
        "registration_number": "粤G妆网备字2026202033",
        "registrant_company": "汕头市雅威健美肤化学厂有限公司",
    },
    (17, 4): {"registration_number": "苏G妆网备字2026003396"},
    (18, 40): {"registration_number": "国妆网备出字（浙）2026005910"},
    (18, 2): {"registration_number": "国妆网备出字（浙）2026005909"},
    (18, 5): {
        "product_name": "BEIAIMENG贝艾梦表皮仿生胚胎种植回春液",
        "registration_number": "粤G妆网备字2026227317",
    },
    (18, 8): {"registration_number": "国妆网备出字（粤）2026033645"},
    (18, 23): {
        "product_name": "SPA exclusives SHEET LIP MASK",
        "registration_number": "国妆网备出字（粤）2026037433",
    },
    (18, 22): {"registration_number": "粤G妆网备字2026233925"},
    (18, 45): {"registration_number": "粤G妆网备字2026233925"},
    (18, 41): {
        "registration_number": "粤G妆网备字2026213393",
        "registrant_company": "广东聚馨堂医药生物科技有限公司",
    },
    (19, 54): {"registration_number": "粤G妆网备字2026217030"},
    (20, 58): {"registration_number": "粤G妆网备字2026221631"},
    (22, 62): {
        "registrant_company": "广州卓芬化妆品有限公司",
        "filing_date": "2026-07-20",
    },
    (22, 29): {"registration_number": "国妆网备出字（浙）2026006698"},
    (22, 55): {"registration_number": "国妆网备出字（浙）2026006697"},
    (23, 13): {"product_name": "MENGCHENGMOONLANART底胶"},
    (23, 37): {
        "product_name": "The Green Party温变轻颜护唇膏-01鲜活粉荔",
        "registration_number": "粤G妆网备字2026187331",
    },
    (21, 8): {
        "product_name": "Plouise A Helping Hand Cream-Fairytale Flavours",
        "registration_number": "国妆网备出字（粤）2026037503",
    },
    (21, 9): {"registration_number": "国妆网备出字（浙）2026005917"},
    (25, 23): {"registration_number": "国妆网备出字（浙）2026005907"},
    (25, 4): {"registration_number": "国妆网备出字（浙）2026006695"},
    (29, 21): {"registration_number": "国妆网备出字（粤）2026037316"},
    (20, 43): {"registration_number": "国妆网备出字（浙）2026006424"},
    (23, 38): {
        "registration_number": "粤G妆网备字2026203574",
        "registrant_company": "兴富生物科技（广东）有限公司",
    },
    (25, 18): {
        "registration_number": "粤G妆网备字2026093531",
        "registrant_company": "兴富生物科技（广东）有限公司",
    },
    (25, 54): {"registration_number": "国妆网备出字（粤）2026031772"},
    (17, 25): {"registration_number": "国妆网备出字（粤）2026036700"},
    (17, 26): {"registration_number": "国妆网备出字（粤）2026036903"},
    (17, 1): {
        "product_name": "MINISO The Powerpuff Girls Collection Facial Blemish Patch with Storage Box",
        "registration_number": "国妆网备出字（浙）2026006677",
    },
    (17, 18): {"registration_number": "粤G妆网备字2026203161"},
    (17, 6): {"registration_number": "国妆网备出字（浙）2026006683"},
    (24, 22): {"registration_number": "国妆网备出字（浙）2026005906"},
    (18, 46): {
        "product_name": "SPA exclusives SHEET LIP MASK",
        "registration_number": "国妆网备出字（粤）2026037433",
    },
    (18, 57): {"registration_number": "国妆网备出字（浙）2026005911"},
    (23, 6): {"registration_number": "国妆网备出字（浙）2026005908"},
    (12, 7): {"registration_number": "国妆网备出字（粤）2026037314"},
    (12, 5): {"registration_number": "国妆网备出字（粤）2026037033"},
    (15, 17): {"registration_number": "国妆网备出字（粤）2026037318"},
    (27, 52): {
        "product_name": "35713-019-润唇膏",
        "registration_number": "国妆网备出字（浙）2026006674",
    },
    (28, 52): {"registration_number": "粤G妆网备字2026131387"},
    (30, 39): {"registration_number": "国妆网备出字（粤）2026037319"},
    (30, 53): {"registration_number": "国妆网备出字（粤）2026037315"},
    (30, 57): {
        "product_name": "FARGER BOND BOOSTER PLEX PRO HAIR TREATMENT 50ml",
        "registration_number": "国妆网备出字（粤）2026037312",
    },
    (30, 9): {"registration_number": "国妆网备出字（粤）2026037034"},
    (13, 12): {
        "product_name": "FARGER PROFESSIONAL HAIR COLOR CREAM 33/0",
        "registration_number": "国妆网备出字（粤）2026037313",
    },
    (29, 56): {"registration_number": "国妆网备出字（浙）2026006680"},
    (29, 20): {
        "product_name": "FARGER BOND BOOSTER PLEX PRO HAIR TREATMENT 235ml",
        "registration_number": "国妆网备出字（粤）2026037311",
    },
    (28, 7): {
        "product_name": "MINISO Hello Kitty Facial Blemish Patch with Storage Box",
        "registration_number": "国妆网备出字（浙）2026006678",
    },
    (20, 26): {"registration_number": "国妆网备出字（粤）2026038001"},
    (21, 12): {
        "product_name": "JMCY 3D SHAPING EYEBROW PENCIL E03",
        "registration_number": "国妆网备出字（浙）2026006696",
    },
    (23, 45): {"registration_number": "国妆网备出字（粤）2026033644"},
    (23, 44): {"registration_number": "国妆网备出字（粤）2026033080"},
    (13, 13): {
        "product_name": "Pacare Bessie White Truffle Luxury Hair Mask",
        "registration_number": "国妆网备出字（粤）2026037305",
    },
    (13, 14): {
        "product_name": "Best Lady® HAIR COLOR SHAMPOO(Natural Black)",
        "registration_number": "国妆网备出字（粤）2026037031",
    },
    (25, 58): {"registration_number": "国妆网备出字（浙）2026006694"},
    (26, 58): {"registration_number": "国妆网备出字（浙）2026006686"},
    (26, 33): {"registration_number": "国妆网备出字（粤）2026037603"},
    (28, 47): {
        "product_name": "MINISO Facial Blemish Patch(Shiny)",
        "registration_number": "国妆网备出字（浙）2026006681",
    },
    (29, 24): {
        "product_name": "FARGER BOND BOOSTER HAIR TREATMENT 235ml",
        "registration_number": "国妆网备出字（粤）2026037310",
    },
    (29, 47): {
        "product_name": "FARGER BOND BOOSTER HAIR TREATMENT 235ml",
        "registration_number": "国妆网备出字（粤）2026037310",
    },
    (9, 11): {"registration_number": "国妆网备出字（浙）2026006682"},
    (28, 4): {"registration_number": "国妆网备出字（沪）2026001816"},
    (6, 1): {
        "product_name": "self/love CONDITIONER FOR HER",
        "registration_number": "国妆网备出字（粤）2026036800",
    },
    (11, 5): {
        "product_name": "198C小皇冠粉盒",
        "registration_number": "国妆网备出字（粤）2026037252",
    },
    (12, 10): {
        "product_name": "K BY CARLOTTA PERFUME 105ML 王者香水",
        "registration_number": "国妆网备出字（粤）2026037103",
    },
    (14, 11): {
        "product_name": "GROWTURN 3D VOLUME SHAMPOO",
        "registration_number": "国妆网备出字（粤）2026037030",
    },
    (15, 12): {
        "product_name": "198H大圆三格",
        "registration_number": "国妆网备出字（粤）2026037257",
    },
    (17, 29): {
        "product_name": "FLIRTSHADE SOFT MATTE LONG WEAR FOUNDATION (17 Warm Honey)",
        "registration_number": "国妆网备出字（粤）2026036231",
    },
    (18, 7): {
        "product_name": "KARA Duo 变色唇油 sheer berry",
        "registration_number": "国妆网备出字（粤）2026037800",
    },
    (18, 39): {
        "product_name": "CARLOTTA FOR LOVED ONE AMIR AL FARIS UNLIMITED 6PCS SET 奕香骑士领袖无限6件套",
        "registration_number": "国妆网备出字（粤）2026037530",
    },
    (19, 2): {
        "product_name": "358C蜻蜓粉盒",
        "registration_number": "国妆网备出字（粤）2026037345",
    },
    (19, 3): {
        "product_name": "358D脚粉盒",
        "registration_number": "国妆网备出字（粤）2026037346",
    },
    (19, 7): {
        "product_name": "238H冰淇淋粉盒",
        "registration_number": "国妆网备出字（粤）2026037371",
    },
    (19, 14): {
        "product_name": "238H冰淇淋粉盒",
        "registration_number": "国妆网备出字（粤）2026037371",
    },
    (19, 15): {
        "product_name": "358F小贝壳粉盒",
        "registration_number": "国妆网备出字（粤）2026037348",
    },
    (19, 16): {
        "product_name": "238J棒棒糖粉盒",
        "registration_number": "国妆网备出字（粤）2026037372",
    },
    (19, 18): {
        "product_name": "878-1M披萨粉盒",
        "registration_number": "国妆网备出字（粤）2026037391",
    },
    (19, 21): {
        "product_name": "348J礼品盒",
        "registration_number": "国妆网备出字（粤）2026037338",
    },
    (19, 23): {
        "product_name": "348F盒装蝴蝶三层",
        "registration_number": "国妆网备出字（粤）2026037334",
    },
    (19, 26): {
        "product_name": "238M甜甜圈粉盒",
        "registration_number": "国妆网备出字（粤）2026037375",
    },
    (19, 27): {
        "product_name": "348N钻桃心粉盒",
        "registration_number": "国妆网备出字（粤）2026037341",
    },
    (19, 30): {
        "product_name": "348N钻桃心粉盒",
        "registration_number": "国妆网备出字（粤）2026037341",
    },
    (19, 32): {
        "product_name": "358E小蝴蝶粉盒",
        "registration_number": "国妆网备出字（粤）2026037347",
    },
    (19, 38): {
        "product_name": "348A大蝴蝶盒子",
        "registration_number": "国妆网备出字（粤）2026037330",
    },
    (19, 46): {
        "product_name": "348D桃心三层",
        "registration_number": "国妆网备出字（粤）2026037332",
    },
    (19, 48): {
        "product_name": "348C糖果四层闪粉",
        "registration_number": "国妆网备出字（粤）2026037331",
    },
    (19, 59): {
        "product_name": "348E草莓三层",
        "registration_number": "国妆网备出字（粤）2026037333",
    },
    (19, 62): {
        "product_name": "348M美人鱼粉盒",
        "registration_number": "国妆网备出字（粤）2026037340",
    },
    (20, 17): {
        "product_name": "Queen Danzern PDRN Soothing RepairLotion",
        "registration_number": "国妆网备出字（粤）2026038000",
    },
    (21, 6): {
        "product_name": "KARA Duo 滋润唇彩 virtual",
        "registration_number": "国妆网备出字（粤）2026037803",
    },
    (22, 25): {
        "product_name": "MALIK AL OUD PERFUME 100ML 沉香香水",
        "registration_number": "国妆网备出字（粤）2026037300",
    },
    (22, 59): {
        "product_name": "CARLOTTA FOR LOVED ONE JAWAD GOLD 6PCS SET 奕香贾瓦德金6件套",
        "registration_number": "国妆网备出字（粤）2026037303",
    },
    (24, 60): {
        "product_name": "428-1E钻石粉盒",
        "registration_number": "国妆网备出字（粤）2026037417",
    },
    (25, 14): {
        "product_name": "428B小飞蝶粉盒",
        "registration_number": "国妆网备出字（粤）2026037410",
    },
    (26, 3): {
        "product_name": "BUBBLY KIDS FOAM HAND WASH 300ML - OCEAN 海洋香儿童洗手液",
        "registration_number": "国妆网备出字（粤）2026037731",
    },
    (26, 8): {
        "product_name": "CARLOTTA FOR LOVED ONE ABIYAD POUDREE 6PCS SET 奕香白韵粉6件套",
        "registration_number": "国妆网备出字（粤）2026037534",
    },
    (26, 44): {
        "product_name": "358B蜜蜂粉盒",
        "registration_number": "国妆网备出字（粤）2026037344",
    },
    (26, 56): {
        "product_name": "238O礼品盒",
        "registration_number": "国妆网备出字（粤）2026037377",
    },
    (26, 60): {
        "product_name": "348K糖果三层",
        "registration_number": "国妆网备出字（粤）2026037339",
    },
    (26, 62): {
        "product_name": "238D小象粉盒",
        "registration_number": "国妆网备出字（粤）2026037367",
    },
    (27, 5): {
        "product_name": "298B飞蝴蝶粉盒",
        "registration_number": "国妆网备出字（粤）2026037379",
    },
    (27, 6): {
        "product_name": "878-1F蝴蝶盒子",
        "registration_number": "国妆网备出字（粤）2026037387",
    },
    (27, 11): {
        "product_name": "348H高跟鞋",
        "registration_number": "国妆网备出字（粤）2026037336",
    },
    (27, 15): {
        "product_name": "348G新梅花三层",
        "registration_number": "国妆网备出字（粤）2026037335",
    },
    (27, 16): {
        "product_name": "348P六格蝴蝶型粉盒",
        "registration_number": "国妆网备出字（粤）2026037342",
    },
    (27, 17): {
        "product_name": "348I冰淇淋",
        "registration_number": "国妆网备出字（粤）2026037337",
    },
    (27, 39): {
        "product_name": "668-1K中蝴蝶粉盒",
        "registration_number": "国妆网备出字（粤）2026037208",
    },
    (27, 43): {
        "product_name": "198D小梅花粉盒",
        "registration_number": "国妆网备出字（粤）2026037253",
    },
    (28, 28): {
        "product_name": "self/love SHAMPOO FOR HIM",
        "registration_number": "国妆网备出字（粤）2026036803",
    },
    (28, 59): {
        "product_name": "218A大蝴蝶粉盒",
        "registration_number": "国妆网备出字（粤）2026037274",
    },
    (29, 36): {
        "product_name": "168B盒装蝴蝶四层",
        "registration_number": "国妆网备出字（粤）2026037190",
    },
    (29, 60): {
        "product_name": "敏姿兰发冻啫喱",
        "registration_number": "粤G妆网备字2026168881",
    },
    (30, 31): {
        "product_name": "668-1Q吉他粉盒",
        "registration_number": "国妆网备出字（粤）2026037210",
    },
    (24, 60): {
        "product_name": "428-1E钻石粉盒",
        "registration_number": "国妆网备出字（粤）2026037417",
        "filing_date": "2026-07-20",
    },
    (26, 62): {
        "product_name": "238D小象粉盒",
        "registration_number": "国妆网备出字（粤）2026037367",
        "registrant_company": "汕头市澄海区腾菲玩具厂",
        "filing_date": "2026-07-19",
    },
    (29, 60): {
        "product_name": "敏姿兰发冻啫喱",
        "registration_number": "粤G妆网备字2026168881",
        "registrant_company": "广东迪悦生物科技有限公司",
        "filing_date": "2026-07-18",
    },
    (22, 60): {"product_name": "御兰润沁舒养护膏"},
    (24, 35): {"product_name": "御兰润沁舒养护油"},
}


def normalize_line(text: str) -> str:
    text = text.replace("粵", "粤").replace("Iimited", "Limited")
    text = re.sub(r"\s+", " ", text).strip()
    # Join OCR-spaced Chinese while preserving normal spaces between Latin words.
    for _ in range(4):
        text = re.sub(
            r"(?<=[\u3400-\u9fff（）()【】#/])\s+(?=[\u3400-\u9fff（）()【】#/0-9])",
            "",
            text,
        )
        text = re.sub(r"(?<=[0-9])\s+(?=[\u3400-\u9fff])", "", text)
    for old, new in OCR_FIXES:
        text = text.replace(old, new)
    return text.strip()


def compact(text: str) -> str:
    return re.sub(r"\s+", "", normalize_line(text))


def find_registration_line(lines: list[str]) -> int | None:
    for idx, line in enumerate(lines):
        value = compact(line)
        if ("妆网备" in value or "妆网各" in value) and ("编号" in value or "备案" in value):
            return idx
    return None


def extract_registration_number(line: str) -> tuple[str, bool]:
    value = compact(line).replace("妆网各", "妆网备")
    number_match = re.search(r"20\s*26(?:\s*\d){4,7}", line)
    digits = re.sub(r"\D", "", number_match.group(0)) if number_match else ""
    valid = True

    if "国妆网备出字" in value or "国妆网备进字" in value:
        filing_type = "国妆网备出字" if "国妆网备出字" in value else "国妆网备进字"
        province_match = re.search(r"[（(]([粤沪浙京湘])[）)]", value)
        province = province_match.group(1) if province_match else "待确认"
        if len(digits) == 8 and province in PROVINCE_CODES:
            digits = digits[:4] + PROVINCE_CODES[province] + digits[4:]
        elif len(digits) == 10 and province in PROVINCE_CODES:
            expected = PROVINCE_CODES[province]
            if digits[4:6] != expected:
                digits = digits[:4] + expected + digits[6:]
        if len(digits) != 10:
            valid = False
        return f"{filing_type}（{province}）{digits or '待确认'}", valid

    province_match = re.search(r"([粤沪浙京湘黔鲁苏豫川鄂闽桂琼皖赣陕晋辽吉黑甘青宁新藏内云贵渝])G妆网备字", value)
    if province_match:
        province = province_match.group(1)
        if len(digits) != 10:
            valid = False
        return f"{province}G妆网备字{digits or '待确认'}", valid

    # Keep the OCR line auditable if an uncommon prefix was not recognized.
    return normalize_line(re.sub(r"^.*?编号\s*[：:]?", "", line)), False


def extract_date(lines: list[str]) -> str:
    joined = " ".join(lines)
    match = re.search(r"2026\s*[一\-—/]\s*0?7\s*[一\-—/]\s*(\d{1,2})", joined)
    if not match:
        return "待确认"
    return f"2026-07-{int(match.group(1)):02d}"


def is_marker(line: str) -> bool:
    value = compact(line)
    return "备案人" in value or "妆网备" in value or "妆网各" in value or "编号" in value


def clean_product(lines: list[str]) -> str:
    kept = []
    for line in lines:
        value = normalize_line(line)
        if not value:
            continue
        if any(phrase in compact(value) for phrase in UI_PHRASES):
            continue
        if re.fullmatch(r"\d{1,2}\s*[：:]\s*\d{2}", value):
            continue
        kept.append(value)
    product = " ".join(kept)
    product = re.sub(r"\s+([）)])", r"\1", product)
    product = re.sub(r"([（(])\s+", r"\1", product)
    return product.strip() or "待确认"


def clean_company(text: str) -> str:
    value = normalize_line(text)
    value = re.sub(r"备案人企业名称|备案人", "", value).strip()
    value = re.sub(r"^[：:]+", "", value).strip()
    value = re.sub(r"\s+", "", value)
    return value or "待确认"


def parse_record(path: Path) -> dict | None:
    raw_lines = [line for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    lines = [normalize_line(line) for line in raw_lines]
    reg_idx = find_registration_line(lines)
    if reg_idx is None:
        return None

    enterprise_indices = [idx for idx, line in enumerate(lines) if "备案人" in compact(line)]
    first_marker = min([reg_idx, *enterprise_indices]) if enterprise_indices else reg_idx
    product = clean_product(lines[:first_marker])

    date_idx = next((idx for idx, line in enumerate(lines) if "备案日期" in compact(line)), len(lines))
    if enterprise_indices and enterprise_indices[0] < reg_idx:
        start = enterprise_indices[0]
        company_lines = lines[start:reg_idx]
    else:
        start = reg_idx + 1
        company_lines = lines[start:date_idx]
    company = clean_company(" ".join(company_lines))

    registration_number, reg_valid = extract_registration_number(lines[reg_idx])
    filing_date = extract_date(lines)

    source_index, card_index = (int(part) for part in path.stem.split("_"))
    issues = []
    if product == "待确认":
        issues.append("产品名称待确认")
    if company == "待确认":
        issues.append("备案人企业待确认")
    if filing_date == "待确认":
        issues.append("备案时间待确认")
    if not reg_valid:
        issues.append("备案编号待确认")

    weird_count = len(re.findall(r"[�□?]", product + company + registration_number))
    score = (
        (30 if product != "待确认" else 0)
        + (30 if company != "待确认" else 0)
        + (30 if reg_valid else 0)
        + (10 if filing_date != "待确认" else 0)
        - weird_count * 10
    )

    record = {
        "source_index": source_index,
        "source_image": IMAGE_NAMES[source_index - 1],
        "card_index": card_index,
        "product_name": product,
        "registration_number": registration_number,
        "registrant_company": company,
        "filing_date": filing_date,
        "recognition_note": "；".join(issues) if issues else "已识别",
        "score": score,
        "raw_text": "\n".join(raw_lines),
    }
    override = MANUAL_OVERRIDES.get((source_index, card_index))
    if override:
        record.update(override)
        record["recognition_note"] = "已人工复核"
        record["score"] = 110
    return record


def main() -> None:
    records = []
    for path in sorted(OCR_DIR.glob("*.txt")):
        record = parse_record(path)
        if record:
            records.append(record)

    by_number: dict[str, list[dict]] = defaultdict(list)
    for record in records:
        by_number[record["registration_number"]].append(record)

    unique_records = []
    for registration_number, group in by_number.items():
        best = max(
            group,
            key=lambda item: (
                item["score"],
                len(item["registrant_company"]),
                len(item["product_name"]),
            ),
        ).copy()
        best["occurrences"] = len(group)
        best["source_locations"] = "、".join(
            f"图{item['source_index']}-区块{item['card_index']}" for item in group
        )
        unique_records.append(best)

    unique_records.sort(
        key=lambda item: (
            item["filing_date"] if item["filing_date"] != "待确认" else "9999-99-99",
            item["source_index"],
            item["card_index"],
        )
    )

    payload = {
        "summary": {
            "candidate_cards": len(list(OCR_DIR.glob("*.txt"))),
            "parsed_occurrences": len(records),
            "unique_registration_numbers": len(unique_records),
            "duplicate_occurrences": len(records) - len(unique_records),
            "records_with_notes": sum(r["recognition_note"] != "已识别" for r in unique_records),
            "date_counts": Counter(r["filing_date"] for r in unique_records),
        },
        "occurrences": records,
        "unique_records": unique_records,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload["summary"], ensure_ascii=False, default=dict))


if __name__ == "__main__":
    main()
