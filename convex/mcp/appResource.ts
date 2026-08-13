export const CONTENT_ENGINE_APP_URI = "ui://content-engine/run/v1.html";
export const CONTENT_ENGINE_APP_MIME_TYPE = "text/html;profile=mcp-app";

const appHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root{color-scheme:dark;--bg:#0d0f12;--panel:#15181d;--line:#2a2f36;--text:#f4f5f7;--muted:#9ba3ae;--accent:#8be6ca;--danger:#ff9a9a;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text)}button,a{font:inherit}.shell{min-height:360px;display:grid;grid-template-rows:auto 1fr auto}.top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;border-bottom:1px solid var(--line)}.eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}h1{font-size:15px;margin:3px 0 0}.status{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted)}.dot{width:7px;height:7px;border-radius:999px;background:var(--accent)}.status.failed{color:var(--danger)}.status.failed .dot{background:var(--danger)}.stage{min-height:260px;display:grid;place-items:center;padding:16px;overflow:hidden}.stage img,.stage video{display:block;max-width:100%;max-height:560px;border-radius:10px;background:#08090b;object-fit:contain}.stage audio{width:min(100%,620px)}.empty{max-width:420px;text-align:center;color:var(--muted);line-height:1.5}.loader{width:30px;height:30px;margin:0 auto 14px;border:2px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.details{width:min(100%,720px);border:1px solid var(--line);border-radius:10px;background:var(--panel);padding:16px}.details pre{margin:10px 0 0;max-height:280px;overflow:auto;white-space:pre-wrap;font-size:12px;color:var(--muted)}.slide-wrap{display:grid;gap:10px;justify-items:center;width:100%}.slide{container-type:inline-size;position:relative;width:min(100%,340px);max-height:560px;overflow:hidden;border-radius:12px;background:#111513;box-shadow:0 18px 48px rgba(0,0,0,.28)}.slide>img{position:absolute;inset:0;width:100%;height:100%;max-height:none;border-radius:0;object-fit:cover}.slide-scrim{position:absolute;inset:0;background:rgba(0,0,0,.3)}.slide-text{position:absolute;display:grid;align-content:center;white-space:pre-wrap;overflow-wrap:anywhere;padding:.12em .2em;line-height:1.08;text-shadow:0 2px 10px rgba(0,0,0,.72)}.slide-controls{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12px}.slide-controls button{border:1px solid var(--line);border-radius:7px;background:var(--panel);color:var(--text);padding:5px 9px;cursor:pointer}.slide-controls button:disabled{opacity:.35;cursor:default}.bottom{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:12px 16px;border-top:1px solid var(--line)}.count{font-size:12px;color:var(--muted)}.actions{display:flex;gap:8px}.action{border:1px solid var(--line);border-radius:8px;padding:7px 10px;background:var(--panel);color:var(--text);text-decoration:none;font-size:12px;cursor:pointer}.action.primary{background:var(--text);color:var(--bg);border-color:var(--text)}.strip{display:flex;gap:7px;overflow:auto;padding:0 16px 12px}.thumb{width:46px;height:46px;flex:0 0 auto;border:1px solid var(--line);border-radius:7px;background:var(--panel);padding:0;overflow:hidden;cursor:pointer;color:var(--muted)}.thumb.active{border-color:var(--accent)}.thumb img,.thumb video{width:100%;height:100%;object-fit:cover}.thumb span{display:grid;place-items:center;width:100%;height:100%;font-size:10px}
  </style>
</head>
<body>
  <main class="shell">
    <header class="top"><div><div class="eyebrow">Content Engine</div><h1 id="title">Command run</h1></div><div id="status" class="status"><span class="dot"></span><span>Connecting</span></div></header>
    <section id="stage" class="stage"><div class="empty"><div class="loader"></div>Waiting for Content Engine…</div></section>
    <div id="strip" class="strip" hidden></div>
    <footer class="bottom"><span id="count" class="count">No artifacts yet</span><div id="actions" class="actions"></div></footer>
  </main>
  <script>
    (() => {
      let snapshot = null, selected = 0, selectedSlide = 0, requestId = 0, pollTimer = null;
      const pending = new Map();
      const title = document.getElementById('title'), status = document.getElementById('status'), stage = document.getElementById('stage'), strip = document.getElementById('strip'), count = document.getElementById('count'), actions = document.getElementById('actions');
      const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
      const safeUrl = value => { try { const url = new URL(String(value ?? '')); return url.protocol === 'https:' || url.protocol === 'http:' ? esc(url.href) : ''; } catch { return ''; } };
      function hostRequest(method, params) {
        if (window.openai?.callTool && method === 'tools/call') return window.openai.callTool(params.name, params.arguments);
        const id = ++requestId;
        window.parent.postMessage({jsonrpc:'2.0',id,method,params}, '*');
        return new Promise((resolve, reject) => { pending.set(id,{resolve,reject}); setTimeout(() => { if(pending.has(id)){pending.delete(id);reject(new Error('Host request timed out'));}},15000); });
      }
      function mediaMarkup(artifact) {
        const url = safeUrl(artifact.url);
        if (artifact.type === 'image' && url) return '<img src="'+url+'" alt="'+esc(artifact.title || 'Generated image')+'" />';
        if (artifact.type === 'video' && url) return '<video src="'+url+'" controls playsinline></video>';
        if (artifact.type === 'audio' && url) return '<audio src="'+url+'" controls></audio>';
        return '<div class="details"><strong>'+esc(artifact.title || artifact.type || 'Artifact')+'</strong><pre>'+esc(JSON.stringify(artifact.data ?? artifact,null,2))+'</pre></div>';
      }
      const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
      const percent = (value, fallback) => Math.min(100, Math.max(0, finite(value, fallback)));
      const color = (value, fallback) => /^#[0-9a-f]{3,8}$/i.test(String(value ?? '')) ? String(value) : fallback;
      function blockMarkup(block, index, stageWidth) {
        const text = block?.text || (Array.isArray(block?.items) ? block.items.join('\n') : '');
        if (!text) return '';
        const x = percent(block.x, 10), y = percent(block.y, index === 0 ? 42 : 62), width = Math.min(100-x, Math.max(12, finite(block.width,80)));
        const size = Math.min(72, Math.max(12, finite(block.fontSize,index === 0 ? 44 : 28)));
        const align = ['left','center','right'].includes(block.align) ? block.align : 'center';
        return '<div class="slide-text" style="left:'+x+'%;top:'+y+'%;width:'+width+'%;min-height:'+Math.max(4,finite(block.height,10))+'%;text-align:'+align+';font-size:clamp(12px,'+((size/stageWidth)*100)+'cqw,72px);font-weight:'+Math.min(950,Math.max(300,finite(block.fontWeight,850)))+';color:'+color(block.color,'#ffffff')+'">'+esc(text)+'</div>';
      }
      function slideshowMarkup(slideshow) {
        const spec = slideshow?.spec || {}, slides = Array.isArray(spec.slides) ? spec.slides.filter(slide => slide?.status !== 'deleted').sort((a,b)=>finite(a.index,0)-finite(b.index,0)) : [];
        if (!slides.length) return '<div class="details"><strong>'+esc(slideshow?.title || 'Slideshow')+'</strong><pre>'+esc(JSON.stringify(spec,null,2))+'</pre></div>';
        selectedSlide = Math.min(selectedSlide, slides.length - 1);
        const slide = slides[selectedSlide], dimensions = slide.dimensions || spec.dimensions || {}, width = Math.max(1,finite(dimensions.width,1080)), height = Math.max(1,finite(dimensions.height,1920));
        const background = safeUrl(slide.backgroundImageUrl), fullGraphic = spec.renderingMode === 'full_graphic_generation' || slide.renderingMode === 'full_graphic_generation';
        const blocks = Array.isArray(slide.textBlocks) ? slide.textBlocks : slide.visibleText ? [{text:slide.visibleText}] : [];
        return '<div class="slide-wrap"><div class="slide" style="aspect-ratio:'+width+'/'+height+'">'+(background?'<img src="'+background+'" alt="" />':'')+(fullGraphic?'':'<div class="slide-scrim"></div>'+blocks.map((block,index)=>blockMarkup(block,index,width)).join(''))+'</div><div class="slide-controls"><button id="slide-prev" '+(selectedSlide===0?'disabled':'')+'>Previous</button><span>'+(selectedSlide+1)+' / '+slides.length+'</span><button id="slide-next" '+(selectedSlide===slides.length-1?'disabled':'')+'>Next</button></div></div>';
      }
      function render() {
        if (!snapshot?.run) return;
        title.textContent = snapshot.run.title || 'Content Engine run';
        const state = snapshot.run.state || 'idle';
        status.className = 'status' + (state === 'failed' ? ' failed' : '');
        status.innerHTML = '<span class="dot"></span><span>'+esc(state.replaceAll('_',' '))+'</span>';
        const artifacts = snapshot.artifacts || [], slideshow = snapshot.slideshows?.[0];
        const showSlideshow = Boolean(slideshow) && !artifacts.some(artifact => artifact.type === 'video' || artifact.type === 'audio');
        selected = Math.min(selected, Math.max(0, artifacts.length - 1));
        if (artifacts.length && !showSlideshow) stage.innerHTML = mediaMarkup(artifacts[selected]);
        else if (state === 'running') stage.innerHTML = '<div class="empty"><div class="loader"></div>Your command is running. This view will update automatically.</div>';
        else if (state === 'failed') stage.innerHTML = '<div class="empty">'+esc(snapshot.run.errorMessage || snapshot.commands?.find(c=>c.errorMessage)?.errorMessage || 'The command failed.')+'</div>';
        else if (slideshow) {
          stage.innerHTML = slideshowMarkup(slideshow);
          const previous = document.getElementById('slide-prev'), next = document.getElementById('slide-next');
          if (previous) previous.onclick = () => { selectedSlide -= 1; render(); };
          if (next) next.onclick = () => { selectedSlide += 1; render(); };
        }
        else stage.innerHTML = '<div class="empty">The command completed without a media artifact. Open the structured result for details.</div>';
        strip.hidden = showSlideshow || artifacts.length < 2;
        strip.innerHTML = artifacts.map((artifact,index) => '<button class="thumb '+(index===selected?'active':'')+'" data-index="'+index+'">'+(artifact.type==='image'&&safeUrl(artifact.url)?'<img src="'+safeUrl(artifact.url)+'" alt="" />':'<span>'+esc(artifact.type)+'</span>')+'</button>').join('');
        strip.querySelectorAll('button').forEach(button => button.onclick = () => { selected = Number(button.dataset.index); render(); });
        const slideCount = snapshot.slideshows?.[0]?.spec?.slides?.filter?.(slide=>slide?.status!=='deleted')?.length || 0;
        count.textContent = artifacts.length ? artifacts.length+' artifact'+(artifacts.length===1?'':'s') : slideCount ? slideCount+' slide'+(slideCount===1?'':'s') : (snapshot.commands?.length || 0)+' command'+((snapshot.commands?.length || 0)===1?'':'s');
        const current = showSlideshow ? null : artifacts[selected];
        const links = [];
        if (safeUrl(current?.url)) links.push('<a class="action" href="'+safeUrl(current.url)+'" target="_blank" rel="noreferrer">Open media</a>');
        if (safeUrl(current?.contentEngineUrl)) links.push('<a class="action primary" href="'+safeUrl(current.contentEngineUrl)+'" target="_blank" rel="noreferrer">Open in Content Engine</a>');
        else if (safeUrl(snapshot.slideshows?.[0]?.contentEngineUrl)) links.push('<a class="action primary" href="'+safeUrl(snapshot.slideshows[0].contentEngineUrl)+'" target="_blank" rel="noreferrer">Edit slideshow</a>');
        else if (safeUrl(snapshot.links?.create)) links.push('<a class="action primary" href="'+safeUrl(snapshot.links.create)+'" target="_blank" rel="noreferrer">Open Content Engine</a>');
        actions.innerHTML = links.join('');
        clearTimeout(pollTimer);
        if (state === 'running' && snapshot.run.id) pollTimer = setTimeout(refresh, snapshot.run.pollAfterMs || 2500);
      }
      async function refresh() {
        try {
          const result = await hostRequest('tools/call',{name:'command.status',arguments:{threadId:snapshot.run.id}});
          snapshot = result?.structuredContent || result?.result?.structuredContent || snapshot;
          render();
        } catch { pollTimer = setTimeout(refresh, 4000); }
      }
      function acceptResult(value) {
        const next = value?.structuredContent || value?.result?.structuredContent || value;
        if (next?.run) { snapshot = next; render(); }
      }
      window.addEventListener('message', event => {
        if (event.source !== window.parent) return;
        const message = event.data;
        if (!message || message.jsonrpc !== '2.0') return;
        if (message.id && pending.has(message.id)) { const item=pending.get(message.id); pending.delete(message.id); message.error?item.reject(message.error):item.resolve(message.result); return; }
        if (message.method === 'ui/notifications/tool-result') acceptResult(message.params);
        if (message.method === 'ui/notifications/tool-input') acceptResult(message.params);
      });
      if (window.openai?.toolOutput) acceptResult(window.openai.toolOutput);
      hostRequest('ui/initialize',{appInfo:{name:'content-engine-run',version:'1.0.0'},capabilities:{tools:{}}}).then(() => window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized'},'*')).catch(()=>{});
    })();
  </script>
</body>
</html>`;

export function contentEngineAppResource() {
  const convexSiteUrl = process.env.CONVEX_SITE_URL?.trim().replace(/\/$/, "");
  const convexStorageUrl = convexSiteUrl?.endsWith(".convex.site")
    ? convexSiteUrl.replace(/\.convex\.site$/, ".convex.cloud")
    : undefined;
  const resourceDomains = [
    convexSiteUrl,
    convexStorageUrl,
    "https://v3.fal.media",
    "https://fal.media",
    "https://storage.googleapis.com",
  ].filter((domain): domain is string => Boolean(domain));

  return {
    contents: [{
      uri: CONTENT_ENGINE_APP_URI,
      mimeType: CONTENT_ENGINE_APP_MIME_TYPE,
      text: appHtml,
      _meta: {
        ui: {
          prefersBorder: true,
          csp: {
            connectDomains: [
              ...(convexSiteUrl ? [convexSiteUrl] : []),
            ],
            resourceDomains,
          },
        },
      },
    }],
  };
}
