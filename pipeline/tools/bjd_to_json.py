"""법정동코드 전체자료(code.go.kr, xlsx→tsv)에서 시도·시군구 표를 만든다.
사용: python pipeline/tools/bjd_to_json.py pipeline/data/bjd-codes.tsv > pipeline/data/sgg-codes.json
원본: https://www.code.go.kr/stdcode/regCodeL.do → 전체자료 다운로드(법정동코드)
다운로드 파일에 시도 행이 빠진 경우(세종 36, 광주 29)가 있어 FALLBACK 으로 보완한다.
"""
import io, json, sys, datetime

SHORT = {"서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구", "인천광역시": "인천", "광주광역시": "광주",
         "대전광역시": "대전", "울산광역시": "울산", "세종특별자치시": "세종", "경기도": "경기", "강원특별자치도": "강원",
         "충청북도": "충북", "충청남도": "충남", "전북특별자치도": "전북", "전라남도": "전남", "경상북도": "경북",
         "경상남도": "경남", "제주특별자치도": "제주",
         # 2026년 광주광역시+전라남도 통합(법정동코드 12). 에어코리아 sidoName 은 옛 이름이 남아 있을 수 있어 둘 다 조회
         "전남광주통합특별시": "전남광주"}
AIR = {"전남광주통합특별시": "광주,전남"}
SIDO_FALLBACK = {"11": "서울특별시", "12": "전남광주통합특별시", "26": "부산광역시", "27": "대구광역시", "28": "인천광역시",
                 "30": "대전광역시", "31": "울산광역시", "36": "세종특별자치시", "41": "경기도", "43": "충청북도",
                 "44": "충청남도", "47": "경상북도", "48": "경상남도", "50": "제주특별자치도",
                 "51": "강원특별자치도", "52": "전북특별자치도"}
# 세종은 시도 행 없이 시군구 행(3611000000)만 있는 경우가 있다
SGG_FALLBACK = {"3611000000": "세종특별자치시"}

rows = [l.rstrip("\n").split("\t") for l in io.open(sys.argv[1], encoding="utf-8")]
rows = [r for r in rows[1:] if len(r) >= 2 and r[0].isdigit() and len(r[0]) == 10]
have = {r[0] for r in rows}
for code, name in SGG_FALLBACK.items():
    if code not in have:
        rows.append([code, name])
sido_seen = {r[0][:2] for r in rows if r[0].endswith("00000000")}
for p, name in SIDO_FALLBACK.items():
    if p not in sido_seen:
        rows.append([p + "00000000", name])

sido, sgg = [], []
for code, name in rows:
    if code.endswith("00000000"):
        short = SHORT.get(name, name[:2])
        sido.append({"code": code[:2], "name": name, "short": short, "air": AIR.get(name, short), "areaNo": code})
    elif code.endswith("00000"):
        parts = name.split(" ")
        sgg.append({"code": code[:5], "sido": code[:2], "name": " ".join(parts[1:]) or name, "full": name})
sido.sort(key=lambda s: s["code"])
sgg.sort(key=lambda s: s["code"])
out = {"updated": datetime.date.today().isoformat(), "source": "code.go.kr 법정동코드", "sido": sido, "sgg": sgg}
sys.stdout.reconfigure(encoding="utf-8")
json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
