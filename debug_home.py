import json, urllib.request, sys
sys.stdout.reconfigure(encoding='utf-8')

resp = urllib.request.urlopen("http://localhost:8788/api/moviebox/home")
data = json.loads(resp.read())
items = data.get("items", [])

# Check CUSTOM items - the subject field
custom = [it for it in items if it.get("type") == "CUSTOM" and it.get("customData")]
if custom:
    first_custom = custom[0]
    cd_items = first_custom["customData"]["items"]
    first_item = cd_items[0]
    print(f"CUSTOM '{first_custom['title']}' first item:")
    print(json.dumps(first_item, indent=2, ensure_ascii=False)[:1000])
    
    # Check subject subfield
    subj = first_item.get("subject", {})
    print(f"\nSubject keys: {list(subj.keys())}")
    print(f"Subject title: {subj.get('title')}")
    print(f"Subject cover: {subj.get('cover', {}).get('url', '')[:80]}")
    print(f"Subject subjectId: {subj.get('subjectId')}")
    print(f"Subject subjectType: {subj.get('subjectType')}")

# Also check image field  
    img = first_item.get("image", {})
    print(f"\nImage keys: {list(img.keys()) if img else 'None'}")
    print(f"Image url: {img.get('url', '')[:80] if img else 'None'}")
