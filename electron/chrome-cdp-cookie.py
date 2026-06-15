"""
Chrome CDP helper: extract cookies, navigate, get page content, fetch via Chrome DevTools Protocol.
Usage:
  python chrome-cdp-cookie.py get-cookie [port]
  python chrome-cdp-cookie.py navigate <url> [port]
  python chrome-cdp-cookie.py get-html [port]
  python chrome-cdp-cookie.py fetch <url> <method> [body] [port]
  python chrome-cdp-cookie.py check [port]
"""
import json, sys
import websocket

def get_page_ws_url(port):
    import urllib.request
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=3) as resp:
            targets = json.loads(resp.read().decode())
        page = next((t for t in targets if t.get("type") == "page"), None)
        if page and page.get("webSocketDebuggerUrl"):
            return page["webSocketDebuggerUrl"]
    except Exception:
        pass
    return None

def cdp_get_cookies(port):
    ws_url = get_page_ws_url(port)
    if not ws_url:
        print("NO_CDP")
        return

    ws = websocket.create_connection(ws_url, timeout=10)
    cmd = {"id": 1, "method": "Network.getCookies", "params": {"urls": ["https://www.fangpi.net"]}}
    ws.send(json.dumps(cmd))
    result = json.loads(ws.recv())
    ws.close()

    cookies = result.get("result", {}).get("cookies", [])
    for cookie in cookies:
        if cookie.get("name") == "cf_clearance" and "fangpi.net" in cookie.get("domain", ""):
            same_site = cookie.get("sameSite", "Lax")
            print(f"CF_CLEARANCE|{cookie['value']}|{cookie.get('expires', -1)}|{cookie.get('path', '/')}|{cookie.get('domain', '.fangpi.net')}|{cookie.get('secure', True)}|{cookie.get('httpOnly', True)}|{same_site}")
            return

    print("NOT_FOUND")

def cdp_navigate(port, url):
    ws_url = get_page_ws_url(port)
    if not ws_url:
        print("NO_CDP")
        return

    ws = websocket.create_connection(ws_url, timeout=15)
    cmd = {"id": 1, "method": "Page.navigate", "params": {"url": url}}
    ws.send(json.dumps(cmd))
    result = json.loads(ws.recv())
    ws.close()
    print("OK")

def cdp_get_html(port):
    ws_url = get_page_ws_url(port)
    if not ws_url:
        print("NO_CDP")
        return

    ws = websocket.create_connection(ws_url, timeout=15)
    cmd = {"id": 1, "method": "Runtime.evaluate", "params": {"expression": "document.documentElement.outerHTML"}}
    ws.send(json.dumps(cmd))
    result = json.loads(ws.recv())
    ws.close()

    value = result.get("result", {}).get("result", {}).get("value")
    if value:
        print(value)
    else:
        print("ERROR")

def cdp_fetch(port, url, method="GET", body=None):
    """Execute a fetch request inside the Chrome page context via CDP."""
    ws_url = get_page_ws_url(port)
    if not ws_url:
        print("NO_CDP")
        return

    ws = websocket.create_connection(ws_url, timeout=30)

    fetch_opts = f'url: {json.dumps(url)}, method: {json.dumps(method)}, credentials: "include"'
    if body:
        fetch_opts += f''', headers: {{"Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest"}}, body: {json.dumps(body)}'''

    expr = f'(async () => {{ try {{ const res = await fetch({{{fetch_opts}}}); return await res.text(); }} catch(err) {{ return "FETCH_ERROR:" + err.message; }} }})()'

    cmd = {"id": 1, "method": "Runtime.evaluate", "params": {
        "expression": expr,
        "awaitPromise": True,
        "returnByValue": True,
    }}
    ws.send(json.dumps(cmd))
    result = json.loads(ws.recv())
    ws.close()

    value = result.get("result", {}).get("result", {}).get("value")
    if value and not value.startswith("FETCH_ERROR:"):
        print(value)
    else:
        print("FETCH_ERROR")

def check_cdp(port):
    import urllib.request
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=2) as resp:
            print("CDP_OK")
    except Exception:
        print("CDP_OFFLINE")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: chrome-cdp-cookie.py <get-cookie|navigate|get-html|fetch|check> [args]")
        sys.exit(1)

    action = sys.argv[1]
    port = int(sys.argv[-1]) if sys.argv[-1].isdigit() else 19222

    if action == "get-cookie":
        cdp_get_cookies(port)
    elif action == "navigate":
        url = sys.argv[2] if len(sys.argv) > 2 else "about:blank"
        cdp_navigate(port, url)
    elif action == "get-html":
        cdp_get_html(port)
    elif action == "fetch":
        url = sys.argv[2] if len(sys.argv) > 2 else ""
        method = sys.argv[3] if len(sys.argv) > 3 else "GET"
        body = sys.argv[4] if len(sys.argv) > 5 else None
        cdp_fetch(port, url, method, body)
    elif action == "check":
        check_cdp(port)
    else:
        print(f"Unknown action: {action}")
