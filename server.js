import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors()); // чтобы редактор из браузера мог дергать сервер
app.use(express.json({ limit: "1mb" }));

const GH_TOKEN  = process.env.GH_TOKEN;              // GitHub токен
const GH_OWNER  = process.env.GH_OWNER || "NikaShum93";
const GH_REPO   = process.env.GH_REPO  || "texts";
const GH_BRANCH = process.env.GH_BRANCH|| "main";
const PUBLISH_KEY = process.env.PUBLISH_KEY;         // наш «секрет для редактора»

function b64utf8(str){ return Buffer.from(str, "utf8").toString("base64"); }

async function ghFetch(url, opts={}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${GH_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      ...(opts.headers || {})
    }
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=> "");
    throw new Error(res.status + " " + res.statusText + (txt?": "+txt:""));
  }
  return res.json();
}

async function getFileSha(path){
  try {
    const data = await ghFetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(path)}?ref=${GH_BRANCH}`);
    return data.sha || null;
  } catch (e) {
    // 404 — файла нет
    return null;
  }
}

/**
 * POST /publish
 * body: { id, mode, content, folder }
 *   mode: "json" => сохранит в data/<id>.json
 *   mode: "html" => сохранит в <id>.html
 */
app.post("/publish", async (req, res) => {
  try {
    if (!PUBLISH_KEY || req.headers["x-publish-key"] !== PUBLISH_KEY) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const { id, mode="json", content, folder="data" } = req.body;
    if (!id || !/^[A-Za-z0-9_\-]{1,64}$/.test(id)) {
      return res.status(400).json({ error: "bad id" });
    }
    if (typeof content !== "string" || !content.length) {
      return res.status(400).json({ error: "empty content" });
    }

    const path = mode === "html" ? `${id}.html` : `${folder}/${id}.json`;
    const sha = await getFileSha(path);

    const body = {
      message: `chore: publish ${path}`,
      content: b64utf8(content),
      branch: GH_BRANCH,
      ...(sha ? { sha } : {})
    };

    const data = await ghFetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(path)}`,
      { method: "PUT", body: JSON.stringify(body) }
    );

    const commitShort = data.commit?.sha?.slice(0, 7);
    const url = mode === "html"
      ? `https://${GH_OWNER}.github.io/${GH_REPO}/${id}.html`
      : `https://${GH_OWNER}.github.io/${GH_REPO}/${folder}/${id}.json`;

    res.json({ ok: true, path, commit: commitShort, url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Publish server listening on :" + port));

