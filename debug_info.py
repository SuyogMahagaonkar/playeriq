import asyncio
import json
from moviebox_api.v3.core import MovieBoxHttpClient, RESOURCE_PATH

async def get_items():
    async with MovieBoxHttpClient() as client:
        payload = {
            "module": "TV_downloadurl_v3",
            "subjectId": "4830273202448466064",
            "se": 1,
            "ep": 1,
            "resolution": 0,
            "page": 1,
        }
        resp = await client._request(RESOURCE_PATH, payload)
        items = resp.get("items", [])
        if items:
            print(json.dumps(items[0], indent=2)[:2000])
        else:
            print("No items")

if __name__ == "__main__":
    asyncio.run(get_items())
