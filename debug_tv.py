import json, urllib.request, sys
sys.stdout.reconfigure(encoding='utf-8')

url = "http://localhost:8788/api/moviebox/info/4830273202448466064"
resp = urllib.request.urlopen(url)
data = json.loads(resp.read())
print("INFO:")
print({k: v for k, v in data.items() if k in ['numberOfSeasons', 'seasons', 'episodes', 'title', 'subjectType']})

url2 = "http://localhost:8788/api/moviebox/seasons/4830273202448466064"
resp2 = urllib.request.urlopen(url2)
data2 = json.loads(resp2.read())
print("SEASONS:")
print({k: v for k, v in data2.items() if k in ['seasons', 'numberOfSeasons']})
if 'seasons' in data2:
    print(f"Season data: {data2['seasons'][:2]}")
