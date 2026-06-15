import asyncio
import sys
import os

# Add the root directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from moviebox_api.v3.core import MovieBoxHttpClient, RESOURCE_PATH

async def fetch():
    async with MovieBoxHttpClient() as client:
        raw = await client.get_from_api(
            RESOURCE_PATH, 
            params={'subjectId': '4830273202448466064', 'resolution': 1080, 'page': 1, 'perPage': 20}
        )
        print([(f.get('se'), f.get('ep')) for f in raw.get('list', [])])

asyncio.run(fetch())
