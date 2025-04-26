const express = require("express");
const path = require("path");
const yts = require("youtube-search-api");
const fetch = require("node-fetch");
const cookieParser = require("cookie-parser");


const app = express();
const port = process.env.PORT || 3000;

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

const API_HEALTH_CHECKER = "https://airy-gamy-exoplanet.glitch.me/check";
const TEMP_API_LIST = "https://raw.githubusercontent.com/Minotaur-ZAOU/test/refs/heads/main/min-tube-api.json";

app.use(express.static(path.join(__dirname, "public")));
app.use(cookieParser());


let currentPage = 0;
let currentQuery = "";
let apiListCache = [];

async function updateApiListCache() {
  let tempApiList = [];
  let mainApiList = [];
  
  // 1. GitHubのAPIリストを最初に取得
  try {
    const tempResponse = await fetch(TEMP_API_LIST);
    if (tempResponse.ok) {
      tempApiList = await tempResponse.json();
      console.log("GitHubのAPIリストを取得しました:", tempApiList);
    } else {
      console.error("GitHub APIリスト取得エラー:", tempResponse.status);
    }
  } catch (err) {
    console.error("GitHub APIリストの取得に失敗:", err);
  }

  // 2. まずはGitHubのリストを`apiListCache`にセット
  if (tempApiList.length > 0) {
    apiListCache = tempApiList;
  }

  // 3. GlitchのAPIリストを取得（成功したら`apiListCache`を更新）
  try {
    const response = await fetch(API_HEALTH_CHECKER);
    if (response.ok) {
      mainApiList = await response.json();
      console.log("GlitchのAPIリストを取得しました:", mainApiList);
      // 4. Glitchのリストが最新なら更新
      if (Array.isArray(mainApiList) && mainApiList.length > 0) {
        apiListCache = mainApiList;
        console.log("APIリストを最新のGlitchのリストに更新しました");
      }
    } else {
      console.error("APIヘルスチェッカーのエラー:", response.status);
    }
  } catch (err) {
    console.error("Glitch APIリストの取得に失敗:", err);
  }
}

updateApiListCache();

function fetchWithTimeout(url, options = {}, timeout = 4000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
    )
  ]);
}

app.use(async (req, res, next) => {
  await updateApiListCache();

  if (!req.cookies || req.cookies.humanVerified !== "true") {
    return res.sendFile(path.join(__dirname, "public", "robots.html"));
  }
  next();
});

// ルートハンドラー
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "home.html"));
});


app.get("/api/search", async (req, res, next) => {
  const query = req.query.q;
  const page = req.query.page || 0;
  if (!query) {
    return res.status(400).json({ error: "検索クエリが必要です" });
  }
  try {
    const results = await yts.GetListByKeyword(query, false, 20, page);
    currentPage = parseInt(page) + 1;
    currentQuery = query;
    res.json(results);
  } catch (err) {
    next(err);
  }
});

app.get("/api/autocomplete", async (req, res, next) => {
  const keyword = req.query.q;
  if (!keyword) {
    return res.status(400).json({ error: "検索クエリが必要です" });
  }
  try {
    const url =
      "http://www.google.com/complete/search?client=youtube&hl=ja&ds=yt&q=" +
      encodeURIComponent(keyword);
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const text = await response.text();
    const jsonStr = text.substring(19, text.length - 1);
    const suggestions = JSON.parse(jsonStr)[1];
    res.json({ suggestions });
  } catch (err) {
    next(err);
  }
});

app.get("/api/playlist", async (req, res, next) => {
  const channelName = req.query.channelName;
  if (!channelName) {
    return res.status(400).json({ error: "channelName パラメータが必要です" });
  }
  try {
    const playlistResults = await yts.GetListByKeyword(channelName, false, 10, 0);
    const playlistItems = playlistResults.items || [];
    const playlist = playlistItems.map(item => ({
      id: item.id,
      title: item.title || "No title"
    }));
    res.json({ playlist });
  } catch (err) {
    next(err);
  }
});

app.get("/api/playlist-ejs", async (req, res, next) => {
  const channelID = req.query.channelID;
  const authorName = req.query.authorName;
  if (!channelID || !authorName) {
    return res.status(400).json({ error: "channelID および authorName パラメータが必要です" });
  }
  try {
    const searchQuery = channelID + " " + authorName;
    const playlistResults = await yts.GetListByKeyword(searchQuery, false, 10, 0);
    const playlistItems = playlistResults.items || [];
    const playlist = playlistItems.map(item => ({
      id: item.id,
      title: item.title || "No title"
    }));
    res.json({ playlist });
  } catch (err) {
    next(err);
  }
});

app.get("/video/:id", async (req, res, next) => {
  const videoId = req.params.id;
  if (!videoId) {
    return res.status(400).send("動画IDが必要です");
  }
  
  try {
    if (!Array.isArray(apiListCache) || apiListCache.length === 0) {
      return res.status(500).send("有効なAPIリストが取得できませんでした。");
    }
    const apiList = apiListCache;

    let videoData = null;
    let commentsData = null;
    let successfulApi = null;

    const overallTimeout = 20000;
    const startTime = Date.now();

    while (Date.now() - startTime < overallTimeout) {
      for (const apiBase of apiList) {
        if (Date.now() - startTime >= overallTimeout) break;
        try {
          const videoResponse = await fetchWithTimeout(
            `${apiBase}/api/video/${videoId}`,
            {},
            9000
          );
          if (videoResponse.ok) {
            const tempData = await videoResponse.json();
            if (tempData.stream_url) {
              videoData = tempData;
              successfulApi = apiBase;
              break;
            }
          }
        } catch (err) {
          console.warn(`${apiBase} での動画取得エラー: ${err.message}`);
          continue;
        }
      }
      if (videoData && videoData.stream_url) break;
    }

    if (!videoData || !videoData.stream_url) {
      videoData = videoData || {};
      videoData.stream_url = "youtube-nocookie";
    }

    if (successfulApi) {
      try {
        const commentsResponse = await fetchWithTimeout(
          `${successfulApi}/api/comments/${videoId}`,
          {},
          4000
        );
        if (commentsResponse.ok) {
          commentsData = await commentsResponse.json();
        }
      } catch (err) {
        console.warn(`${successfulApi} でのコメント取得エラー: ${err.message}`);
      }
    }
    if (!commentsData) {
      commentsData = { commentCount: 0, comments: [] };
    }

    const streamEmbedHTML =
      videoData.stream_url !== "youtube-nocookie"
        ? `<video controls autoplay style="border-radius: 8px;">
             <source src="${videoData.stream_url}" type="video/mp4">
             お使いのブラウザは video タグに対応していません。
           </video>`
        : `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen style="border-radius: 8px;"></iframe>`;

    const youtubeEmbedHTML = `<iframe style="width: 932px; height:524px; border: none; border-radius: 8px;" src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;

    let commentsHTML = "";
    if (commentsData.comments && Array.isArray(commentsData.comments) && commentsData.comments.length > 0) {
      commentsHTML = commentsData.comments
        .map((comment) => {
          const thumb =
            comment.authorThumbnails && comment.authorThumbnails.length > 0
              ? comment.authorThumbnails[0].url
              : "";
          return `
            <div class="comment">
              <div class="comment-header">
                ${thumb ? `<img class="avatar" src="${thumb}" alt="${comment.author}">` : ""}
                <span class="comment-author">${comment.author}</span>
                <span class="comment-time">${comment.publishedText || ""}</span>
              </div>
              <div class="comment-body">${comment.contentHtml || comment.content}</div>
              <div class="comment-stats">Likes: ${comment.likeCount || 0}</div>
            </div>
        `;
        })
        .join("");
    } else {
      commentsHTML = "<p>コメントがありません。</p>";
    }

    const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${videoData.videoTitle || "動画詳細"}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin:0;
      padding:0;
      background-color: #121212;
      color: #e0e0e0;
    }
    header {
      padding: 20px;
      text-align: center;
      background-color: #1e1e1e;
    }
    header h1 {
      margin: 0;
      font-size: 24px;
    }
    .container {
      padding: 20px;
    }
    .main-content {
      display: flex;
      gap: 20px;
      align-items: flex-start;
    }
    .video-section {
      flex: 1;
    }
    .video-player {
      width: 100%;
      max-width: auto;
      margin: 0 auto;
    }
    video, iframe {
      width:  100%;
      height: auto;
      background-color: black;
    }
    
    #controls {
      display: flex;
      justify-content: center;
      gap: 10px;
      overflow-x: auto;
      padding: 10px 0;
    }
    #controls button {
      flex: 0 0 auto;
      padding: 8px 12px;
      font-size: 14px;
      cursor: pointer;
      background-color: #333;
      border: none;
      color: #e0e0e0;
      border-radius: 4px;
    }
    #controls button:hover {
      background-color: #555;
    }
    #controls button.active {
      background-color: #bb86fc;
      color: #121212;
    }
    .details {
      max-width: 800px;
      margin: 20px auto;
    }
    .channel-info {
      display: flex;
      align-items: center;
      margin-bottom: 10px;
    }
    .channel-avatar {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      object-fit: cover;
      margin-right: 10px;
    }
    .comments {
      max-width: 800px;
      margin: 20px auto;
    }
    .comment {
      border-bottom: 1px solid #333;
      padding: 10px 0;
    }
    .comment-header {
      display: flex;
      align-items: center;
    }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      object-fit: cover;
      margin-right: 10px;
    }
    .comment-author {
      font-weight: bold;
    }
    .comment-time {
      margin-left: auto;
      font-size: 12px;
      color: #aaa;
    }
    .comment-body {
      margin: 5px 0;
    }
    .comment-stats {
      font-size: 12px;
      color: #aaa;
    }
    a {
      color: #bb86fc;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .back-link {
      margin-top: 20px;
      display: block;
      text-align: center;
    }
    
    .playlist-section {
      width: 300px;
      background-color: #1e1e1e;
      padding: 10px;
      border-radius: 4px;
      max-height: 600px;
      overflow-y: auto;
    }
    .playlist-section h2 {
      font-size: 18px;
      margin-bottom: 10px;
    }
    .playlist-item {
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
      background-color: #121212;
      padding: 5px;
      border-radius: 4px;
    }
    .playlist-item img {
      width: 90px;
      height: auto;
      display: block;
      border-radius: 8px;
    }
    .playlist-item-title {
      font-size: 14px;
      font-weight: bold;
      color: #e0e0e0;
    }
    
    .search-header {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  background-color: #1b1b1b; 
  padding: 10px 20px;
  display: flex;
  justify-content: space-between; 
  align-items: center;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5);
  z-index: 1000;
}


.logo a {
  color: #a64ac9; 
  font-size: 24px;
  font-weight: bold;
  text-decoration: none;
  transition: color 0.3s ease;
}

.logo a:hover {
  color: #d891ef; 
}


#search-form {
  display: flex;
  max-width: 600px;
  width: 100%;
}


#search-input {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 2px 0 0 2px;
  background-color: #333333; 
  color: #ffffff;
  font-size: 16px;
  outline: none;
}


#search-form button {
  padding: 10px 20px;
  border: none;
  background-color: #6200ea; 
  color: #ffffff;
  font-size: 16px;
  border-radius: 0 2px 2px 0;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

#search-form button:hover {
  background-color: #4500b5; /* ホバー時の濃い紫 */
}
    
    .loading-animation {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 300px;
    }
    .spinner {
      border: 8px solid rgba(255, 255, 255, 0.2);
      border-top: 8px solid #bb86fc;
      border-radius: 50%;
      width: 60px;
      height: 60px;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
<header class="search-header">
    <div class="logo">
      <a href="/">MIN-Tube2</a>
    </div>
    <form id="search-form">
      <input type="text" id="search-input" name="q" placeholder="検索..." autocomplete="off">
      <button type="submit">検索</button>
    </form>
  </header>
  </header>
  <header>
    <h1>status:OK</h1>
  </header>
  <div class="container">
    <div class="main-content">
      <div class="video-section">
        <div class="video-player" id="video-player-container">
          <div class="loading-animation"><div class="spinner"></div></div>
        </div>
        
        <div id="controls">
          <button id="switch-stream-url" class="active">DL‑Yvideo</button>
          <button id="switch-nocookie">YouTube‑nocookie</button>
          <button id="reload-video">動画を再読み込み</button>
          <button id="refetch-video">動画を再取得</button>
          <button id="download-video">ダウンロード</button>
        </div>
  <header>
    <h1>${videoData.videoTitle || "動画詳細"}</h1>
  </header>
        <div class="details">
          <h2>動画詳細</h2>
          <div class="channel-info">
            <img class="channel-avatar" src="${videoData.channelImage || ''}" alt="${videoData.channelName || 'チャンネル'}">
            <div>
              <p>${videoData.channelName || 'チャンネル名未設定'}</p>
            </div>
          </div>
          <p>${videoData.videoDes || "詳細情報はありません"}</p>
          <p>視聴回数: ${videoData.videoViews ? videoData.videoViews.toLocaleString() : "0"}</p>
          <p>いいね: ${videoData.likeCount ? videoData.likeCount.toLocaleString() : "0"}</p>
          <p><a href="https://www.youtube.com/watch?v=${videoId}" target="_blank">YouTubeで視聴する</a></p>
        </div>
        <div class="comments">
          <h2>コメント (${commentsData.commentCount || 0} 件)</h2>
          ${commentsHTML}
        </div>
        <a class="back-link" href="/">home</a>
      </div>
      <div class="playlist-section">
        <h2>${videoData.channelName || "プレイリスト"}</h2>
        <div id="playlist-container">
          <p>読み込み中...</p>
        </div>
      </div>
    </div>
  </div>
  <script>
    window.addEventListener('DOMContentLoaded', () => {
      const channelName = "${videoData.channelName || ''}";
      if (channelName) {
        fetch('/api/playlist?channelName=' + encodeURIComponent(channelName))
          .then(response => response.json())
          .then(data => {
            let html = "";
            if (data.playlist && data.playlist.length > 0) {
              data.playlist.forEach(item => {
                html += \`
                  <div class="playlist-item">
                    <a href="/video/\${item.id}">
                      <img src="https://i3.ytimg.com/vi/\${item.id}/sddefault.jpg" alt="\${item.title}">
                      <div class="playlist-item-title">\${item.title}</div>
                    </a>
                  </div>
                \`;
              });
            } else {
              html = "<p>プレイリストがありません。</p>";
            }
            document.getElementById("playlist-container").innerHTML = html;
          })
          .catch(err => {
            console.error(err);
            document.getElementById("playlist-container").innerHTML = "<p>プレイリストの読み込みに失敗しました。</p>";
          });
      } else {
        document.getElementById("playlist-container").innerHTML = "<p>チャネル情報がありません。</p>";
      }
      
      const streamEmbedHTML = \`${streamEmbedHTML.replace(/`/g, '\\`')}\`;
      const youtubeEmbedHTML = \`${youtubeEmbedHTML.replace(/`/g, '\\`')}\`;
      
      setTimeout(() => {
        const container = document.getElementById("video-player-container");
        if (container) {
          container.innerHTML = streamEmbedHTML;
        }
      }, 1000);
      
      const btnStream = document.getElementById("switch-stream-url");
      const btnNocookie = document.getElementById("switch-nocookie");
      const btnReload = document.getElementById("reload-video");
      const btnRefetch = document.getElementById("refetch-video");
      const btnDownload = document.getElementById("download-video");
      
      btnStream.addEventListener("click", () => {
        document.getElementById("video-player-container").innerHTML = streamEmbedHTML;
        btnStream.classList.add("active");
        btnNocookie.classList.remove("active");
      });
      btnNocookie.addEventListener("click", () => {
        document.getElementById("video-player-container").innerHTML = youtubeEmbedHTML;
        btnNocookie.classList.add("active");
        btnStream.classList.remove("active");
      });
      btnReload.addEventListener("click", () => {
        const videoElem = document.querySelector('.video-player video');
        if (videoElem) {
          videoElem.load();
          videoElem.play();
        } else {
          const iframeElem = document.querySelector('.video-player iframe');
          if (iframeElem) {
            iframeElem.src = iframeElem.src;
          }
        }
      });
      btnRefetch.addEventListener("click", () => {
        window.location.reload();
      });
      btnDownload.addEventListener("click", () => {
        const dlLink = ( "${videoData.stream_url}" !== "youtube-nocookie" )
            ? "${videoData.stream_url}"
            : "https://www.youtube.com/watch?v=${videoId}";
        window.open(dlLink, '_blank');
      });
    });
    document.addEventListener("DOMContentLoaded", function() {
  const form = document.getElementById("search-form");
  
  form.addEventListener("submit", function(event) {
    event.preventDefault(); 
    const query = document.getElementById("search-input").value.trim();
    
    if (query) {
      window.location.href = "/nothing/search?q=" + encodeURIComponent(query);
    }
  });
});
  </script>
</body>
</html>
    `;
    res.send(html);
  } catch (err) {
    next(err);
  }
});

app.get("/channel/:channelId", async (req, res, next) => {
  const channelId = req.params.channelId;
  if (!channelId) {
    return res.status(400).send("チャンネルIDが必要です");
  }

  try {
    const apiBase = apiListCache[0];
    if (!apiBase) {
      return res.status(500).send("有効なAPIリストが取得できませんでした。");
    }
    const apiUrl = `${apiBase}/api/channels/${channelId}`;
    const response = await fetchWithTimeout(apiUrl, {}, 4000);
    if (!response.ok) {
      return res.status(500).send("チャンネル情報の取得に失敗しました");
    }
    const channelData = await response.json();
    
    res.render("channel", { channel: channelData });
  } catch (err) {
    next(err);
  }
});

app.get("/nothing/*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "home.html"));
});

app.get("/api", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "tools/api.html"));
});

app.get("/apps", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "tools/apps.html"));
});

app.get("/about", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "tools/about.html"));
});

app.get('/all-api', async (req, res) => {
    const url = 'https://raw.githubusercontent.com/Minotaur-ZAOU/test/refs/heads/main/min-tube2-all-api.json';
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).send('Error fetching data');
    }
});

app.get('/proxy/*', async (req, res) => {
  const targetUrl = req.params[0];

  if (!targetUrl) {
    res.status(400).send('URLパラメータが必要です');
    return;
  }

  console.log(`Proxying request for: ${targetUrl}`);

  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      res.status(response.status).send(`リクエストエラー: ${response.statusText}`);
      return;
    }

    // Content-Typeを取得
    const contentType = response.headers.get('content-type') || '';

    // HTMLやテキスト系コンテンツの場合はテキストで返す
    if (contentType.startsWith('text/') || contentType.includes('application/json')) {
      const text = await response.text();
      res.set('Content-Type', contentType);
      res.send(text);
    } else {
      // 画像や動画などのバイナリコンテンツの場合
      const buffer = await response.buffer();
      res.set('Content-Type', contentType);
      res.send(buffer);
    }
  } catch (error) {
    console.error('Error fetching URL:', error);
    res.status(500).send('サーバ内部エラー');
  }
});



app.use((req, res, next) => {
  res.status(404).sendFile(path.join(__dirname, "public", "error.html"));
});
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).sendFile(path.join(__dirname, "public", "error.html"));
});

app.listen(port, () => {
  console.log(`サーバーがポート ${port} で起動しました。`);
});
