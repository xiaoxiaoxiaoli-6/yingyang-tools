/* ============================================================
 * 中转代理 —— 部署到 Cloudflare Workers（免费）
 * 作用：唯一持有硅基流动 Key 的地方。发给会员的网页只调这个代理，
 *       看不到 Key，所以 Key 不会泄露、不会被盗刷。
 *
 * 部署要点（详见《使用说明.md》）：
 *   1. 把本文件全文粘进 Cloudflare 的 Worker 编辑器
 *   2. 在 Worker 的 Settings → Variables and Secrets 里
 *      新增一条 Secret： 名字 = SILICONFLOW_KEY  值 = 你的 sk-xxxx
 *   3. Deploy，复制得到的 https://xxx.workers.dev 地址
 *   4. 把该地址填进 会员版-食材配菜生成器.html 顶部的 PROXY_URL
 * ============================================================ */

export default {
  async fetch(request, env) {
    const cors = {
      // 上线稳定后，可把 * 改成你放网页的域名，只允许自己的页面调用，更安全
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };

    // 浏览器预检
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') {
      return new Response('Only POST', { status: 405, headers: cors });
    }
    if (!env.SILICONFLOW_KEY) {
      return json({ error: '代理未配置 SILICONFLOW_KEY，请在 Worker 的 Variables 里添加' }, 500, cors);
    }

    let body;
    try { body = await request.json(); }
    catch { return json({ error: '请求体不是合法 JSON' }, 400, cors); }

    // —— 可选加固：防止别人白嫖你的额度（想更省心就取消注释）——
    // 1) 只允许指定模型
    // const ALLOW = ['deepseek-ai/DeepSeek-V3'];
    // if (!ALLOW.includes(body.model)) body.model = ALLOW[0];
    // 2) 给输出长度封顶，控制单次花费
    if (typeof body.max_tokens !== 'number' || body.max_tokens > 2000) body.max_tokens = 1200;

    let upstream;
    try {
      upstream = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.SILICONFLOW_KEY}`,   // Key 从环境变量读，不写进代码
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      return json({ error: '连接硅基流动失败：' + e.message }, 502, cors);
    }

    // 原样透传硅基流动的返回，并补上 CORS 头
    const out = new Response(upstream.body, upstream);
    Object.entries(cors).forEach(([k, v]) => out.headers.set(k, v));
    return out;
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
