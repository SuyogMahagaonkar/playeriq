import asyncio
from moviebox_api.v3.core import MovieBoxHttpClient, RESOURCE_PATH

async def fetch():
    async with MovieBoxHttpClient() as client:
        # Season 5 Episode 7 won't fit on page 1 (20 eps), try page 2 and 3
        for page in [2, 3, 4]:
            raw = await client.get_from_api(
                RESOURCE_PATH, 
                params={'subjectId': '4830273202448466064', 'resolution': 1080, 'page': page, 'perPage': 20}
            )
            items = raw.get('list', [])
            print(f"=== PAGE {page} === ({len(items)} items)")
            for item in items:
                se = item.get('se')
                ep = item.get('ep')
                url = item.get('resourceLink') or item.get('url')
                print(f"  S{se} E{ep} => {url[:80] if url else 'None'}...")
            
            # Check if we found S5E7
            match = next((f for f in items if f.get('se')==5 and f.get('ep')==7), None)
            if match:
                print(f"\n=== FOUND IT ===")
                print(match.get('resourceLink') or match.get('url'))
                break

asyncio.run(fetch())
