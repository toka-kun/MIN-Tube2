import json
import requests
import urllib.parse
import time
import datetime
import random
import os
import subprocess
from cache import cache
import ast

# 3 => (3.0, 1.5) => (1.5, 1)
max_api_wait_time = (1.5, 1)
# 10 => 10
max_time = 10

user_agents = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
    # ... 他のUser-Agentも含めてください
]

def getRandomUserAgent():
    user_agent = user_agents[random.randint(0, len(user_agents) - 1)]
    print(user_agent)
    return {
        'User-Agent': user_agent
    }

class InvidiousAPI:
    def __init__(self):
        self.all = ast.literal_eval(requests.get('https://raw.githubusercontent.com/LunaKamituki/yukiyoutube-inv-instances/refs/heads/main/main.txt', headers=getRandomUserAgent(), timeout=(1.0, 0.5)).text)
        
        self.video = self.all['video']
        self.playlist = self.all['playlist']
        self.search = self.all['search']
        self.channel = self.all['channel']
        self.comments = self.all['comments']

        self.check_video = False

    def info(self):
        return {
            'API': self.all,
            'checkVideo': self.check_video
        }

invidious_api = InvidiousAPI()

url = requests.get('https://raw.githubusercontent.com/LunaKamituki/Yuki-BBS-Server-URL/refs/heads/main/server.txt', headers=getRandomUserAgent()).text.rstrip()

version = "1.0"
new_instance_version = "1.3.2"

os.system("chmod 777 ./yukiverify")

class APITimeoutError(Exception):
    pass

class UnallowedBot(Exception):
    pass

def isJSON(json_str):
    try:
        json.loads(json_str)
        return True
    except json.JSONDecodeError:
        return False

def updateList(lst, item):
    lst.append(item)
    lst.remove(item)
    return lst

def requestAPI(path, api_urls):
    starttime = time.time()
    
    for api in api_urls:
        if time.time() - starttime >= max_time - 1:
            break
            
        try:
            print(api + 'api/v1' + path)
            res = requests.get(api + 'api/v1' + path, headers=getRandomUserAgent(), timeout=max_api_wait_time)
            if res.status_code == requests.codes.ok and isJSON(res.text):
                
                if invidious_api.check_video and path.startswith('/video/'):
                    video_res = requests.get(json.loads(res.text)['formatStreams'][0]['url'], headers=getRandomUserAgent(), timeout=(3.0, 0.5))
                    if not 'video' in video_res.headers['Content-Type']:
                        print(f"No Video(True)({video_res.headers['Content-Type']}): {api}")
                        updateList(api_urls, api)
                        continue

                if path.startswith('/channel/') and json.loads(res.text)["latestvideo"] == []:
                    print(f"No Channel: {api}")
                    updateList(api_urls, api)
                    continue

                print(f"Success({invidious_api.check_video})({path.split('/')[1].split('?')[0]}): {api}")
                return res.text

            elif isJSON(res.text):
                print(f"Returned Err0r(JSON): {api} ('{json.loads(res.text)['error'].replace('error', 'err0r')}')")
                updateList(api_urls, api)
            else:
                print(f"Returned Err0r: {api} ('{res.text[:100]}')")
                updateList(api_urls, api)
        except:
            print(f"Err0r: {api}")
            updateList(api_urls, api)
    
    raise APITimeoutError("APIがタイムアウトしました")

def getVideoData(videoid):
    t = json.loads(requestAPI(f"/videos/{urllib.parse.quote(videoid)}", invidious_api.video))

    if 'recommendedvideo' in t:
        recommended_videos = t["recommendedvideo"]
    elif 'recommendedVideos' in t:
        recommended_videos = t["recommendedVideos"]
    else:
        recommended_videos = {
            "videoId": "Load Failed",
            "title": "Load Failed",
            "authorId": "Load Failed",
            "author": "Load Failed",
            "lengthSeconds": 0,
            "viewCountText": "Load Failed"
        }

    return [
        {
            'video_urls': list(reversed([i["url"] for i in t["formatStreams"]]))[:2],
            'description_html': t["descriptionHtml"].replace("\n", "<br>"),
            'title': t["title"],
            'length_text': str(datetime.timedelta(seconds=t["lengthSeconds"])),
            'author_id': t["authorId"],
            'author': t["author"],
            'author_thumbnails_url': t["authorThumbnails"][-1]["url"],
            'view_count': t["viewCount"],
            'like_count': t["likeCount"],
            'subscribers_count': t["subCountText"]
        },
        [
            {
                "video_id": i["videoId"],
                "title": i["title"],
                "author_id": i["authorId"],
                "author": i["author"],
                "length_text": str(datetime.timedelta(seconds=i["lengthSeconds"])),
                "view_count_text": i["viewCountText"]
            } for i in recommended_videos
        ]
    ]

# FastAPIのインポート
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse as redirect
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from typing import Union

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/js", StaticFiles(directory="./statics/js"), name="static")
app.mount("/css", StaticFiles(directory="./statics/css"), name="static")
app.mount("/img", StaticFiles(directory="./statics/img"), name="static")
app.mount("/genesis", StaticFiles(directory="./blog", html=True), name="static")
template = Jinja2Templates(directory='templates').TemplateResponse

@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return template("home.html", {"request": request})

@app.get('/watch', response_class=HTMLResponse)
def video(v: str, request: Request):
    video_data = getVideoData(v)
    return template('video.html', {
        "request": request,
        "videoid": v,
        "videourls": video_data[0]['video_urls'],
        "description": video_data[0]['description_html'],
        "video_title": video_data[0]['title'],
        "author_id": video_data[0]['author_id'],
        "author_icon": video_data[0]['author_thumbnails_url'],
        "author": video_data[0]['author'],
        "length_text": video_data[0]['length_text'],
        "view_count": video_data[0]['view_count'],
        "like_count": video_data[0]['like_count'],
        "subscribers_count": video_data[0]['subscribers_count'],
        "recommended_videos": video_data[1],
    })

@app.get("/search", response_class=HTMLResponse)
def search(q: str, request: Request, page: Union[int, None] = 1):
    return template("search.html", {"request": request, "results": getSearchData(q, page), "word": q, "next": f"/search?q={q}&page={page + 1}"})

@app.get("/channel/{channelid}", response_class=HTMLResponse)
def channel(channelid: str, request: Request):
    t = getChannelData(channelid)
    return template("channel.html", {
        "request": request,
        "results": t[0],
        "channel_name": t[1]["channel_name"],
        "channel_icon": t[1]["channel_icon"],
        "channel_profile": t[1]["channel_profile"],
        "cover_img_url": t[1]["author_banner"],
        "subscribers_count": t[1]["subscribers_count"],
    })

@app.get("/playlist", response_class=HTMLResponse)
def playlist(list: str, request: Request, page: Union[int, None] = 1):
    return template("search.html", {"request": request, "results": getPlaylistData(list, str(page)), "word": "", "next": f"/playlist?list={list}"})

@app.get("/comments")
def comments(request: Request, v: str):
    return template("comments.html", {"request": request, "comments": getCommentsData(v)})

@app.exception_handler(500)
def error500(request: Request, __):
    return template("error.html", {"request": request, "context": '500 Internal Server Error'}, status_code=500)

@app.exception_handler(APITimeoutError)
def apiWait(request: Request, exception: APITimeoutError):
    return template("apiTimeout.html", {"request": request}, status_code=504)

@app.exception_handler(UnallowedBot)
def returnToUnallowedBot(request: Request, exception: UnallowedBot):
    return template("error.html", {"request": request, "context": '403 Forbidden'}, status_code=403)

# 他のエンドポイントも必要に応じて追加してください
