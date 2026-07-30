(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let config = null;
  let selectedTrack = null;
  let storyboard = null;

  async function loadConfig() {
    try {
      const res = await fetch("./bandit-config.json", { cache: "no-store" });
      if (!res.ok) throw new Error("Config could not be loaded");
      config = await res.json();
      $("configStatus").textContent = `${config.appName} ${config.version} ready`;
    } catch (error) {
      $("configStatus").textContent = "Using built-in defaults";
      config = {
        api: { baseUrl: "", routes: { splitStems: "/api/stems", storyboard: "/api/storyboard", generateVideo: "/api/video" } },
        exports: { default: { container: "mp4", aspect: "vertical", quality: "high", fps: 30 },
          aspects: { vertical:{width:1080,height:1920}, square:{width:1080,height:1080}, landscape:{width:1920,height:1080}, landscape4k:{width:3840,height:2160} } }
      };
    }
    syncExportUI();
  }

  function apiUrl(route) {
    return `${config?.api?.baseUrl || ""}${route}`;
  }

  function syncExportUI() {
    const d = config.exports.default;
    $("exportContainer").value = d.container;
    $("exportAspect").value = d.aspect;
    $("exportQuality").value = d.quality;
    $("exportFps").value = String(d.fps);
    updateResolution();
  }

  function updateResolution() {
    const aspect = $("exportAspect").value;
    const dims = config.exports.aspects[aspect];
    $("resolution").textContent = dims ? `${dims.width} × ${dims.height}` : "Custom";
  }

  function setStudioStatus(text, busy = false) {
    $("studioStatus").textContent = text;
    document.querySelectorAll("[data-ai-action]").forEach(btn => btn.disabled = busy || !selectedTrack);
  }

  async function postForm(route, fields) {
    const data = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined && value !== null) data.append(key, value);
    });
    const response = await fetch(apiUrl(route), { method: "POST", body: data });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(detail || `Request failed (${response.status})`);
    }
    return response;
  }

  $("studioTrack").addEventListener("change", (event) => {
    selectedTrack = event.target.files?.[0] || null;
    $("studioTrackName").textContent = selectedTrack ? selectedTrack.name : "";
    setStudioStatus(selectedTrack ? "Track loaded. Pick a tool." : "Choose a track.");
  });

  $("splitVocals").addEventListener("click", async () => {
    if (!selectedTrack) return;
    setStudioStatus("Sending track to the secure stem-separation backend…", true);
    try {
      const res = await postForm(config.api.routes.splitStems, {
        audio: selectedTrack,
        mode: $("stemMode").value
      });
      const blob = await res.blob();
      downloadBlob(blob, `Funk_Bandit_${$("stemMode").value}.zip`);
      setStudioStatus("Stem package ready.");
    } catch (error) {
      setStudioStatus(`Stem splitter needs a deployed backend: ${error.message}`);
    }
  });

  $("makeStoryboard").addEventListener("click", async () => {
    if (!selectedTrack) return;
    setStudioStatus("Building a scene-by-scene storyboard…", true);
    try {
      const payload = {
        title: $("songTitle").value.trim(),
        lyrics: $("lyrics").value.trim(),
        visualStyle: $("visualStyle").value.trim(),
        durationSeconds: Number($("durationSeconds").value || 0),
        export: getExportSettings()
      };
      const response = await fetch(apiUrl(config.api.routes.storyboard), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(await response.text() || `Request failed (${response.status})`);
      storyboard = await response.json();
      $("storyboardOutput").value = JSON.stringify(storyboard, null, 2);
      setStudioStatus("Storyboard ready. Review it, then generate the video.");
    } catch (error) {
      const demo = buildLocalStoryboard();
      storyboard = demo;
      $("storyboardOutput").value = JSON.stringify(demo, null, 2);
      setStudioStatus("Backend unavailable, so a local draft storyboard was created.");
    }
  });

  $("generateVisual").addEventListener("click", () => {
    if (!selectedTrack) return;
    const settings = getExportSettings();
    const title = $("songTitle").value.trim() || "Untitled Funk";
    const style = $("visualStyle").value.trim() || "futuristic funk neon collage";
    $("visualPreview").innerHTML = `
      <div class="visual-card">
        <div class="orb"></div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(style)}</span>
        <small>${settings.width}×${settings.height} · ${settings.container.toUpperCase()}</small>
      </div>`;
    setStudioStatus("Concept visual generated locally. Full rendered media uses the video backend.");
  });

  $("generateVideo").addEventListener("click", async () => {
    if (!selectedTrack) return;
    if (!storyboard) storyboard = buildLocalStoryboard();
    setStudioStatus("Submitting the music-video job…", true);
    try {
      const response = await postForm(config.api.routes.generateVideo, {
        audio: selectedTrack,
        storyboard: JSON.stringify(storyboard),
        export: JSON.stringify(getExportSettings())
      });
      const type = response.headers.get("content-type") || "";
      if (type.includes("application/json")) {
        const job = await response.json();
        $("jobOutput").textContent = JSON.stringify(job, null, 2);
        setStudioStatus("Video job created. Your backend can return a job ID or finished file.");
      } else {
        downloadBlob(await response.blob(), `Funk_Bandit_Music_Video.${$("exportContainer").value}`);
        setStudioStatus("Music video ready.");
      }
    } catch (error) {
      setStudioStatus(`Music-video generation needs a deployed backend: ${error.message}`);
    }
  });

  ["exportAspect", "exportContainer", "exportQuality", "exportFps"].forEach(id => {
    $(id).addEventListener("change", updateResolution);
  });

  $("importConfig").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      config = { ...config, ...parsed, exports: { ...config.exports, ...(parsed.exports || {}) } };
      syncExportUI();
      $("configStatus").textContent = `Imported ${file.name}`;
    } catch {
      $("configStatus").textContent = "That JSON file is invalid.";
    }
  });

  function getExportSettings() {
    const dims = config.exports.aspects[$("exportAspect").value];
    return {
      container: $("exportContainer").value,
      aspect: $("exportAspect").value,
      quality: $("exportQuality").value,
      fps: Number($("exportFps").value),
      width: dims.width,
      height: dims.height,
      preserveOriginalAudio: $("preserveAudio").checked
    };
  }

  function buildLocalStoryboard() {
    const lyrics = $("lyrics").value.trim();
    const sections = lyrics.split(/\n(?=\[)/).filter(Boolean);
    const total = Number($("durationSeconds").value || 180);
    const count = Math.max(1, sections.length || 6);
    const sceneLength = Math.round((total / count) * 10) / 10;
    return {
      title: $("songTitle").value.trim() || "Untitled Funk",
      visualStyle: $("visualStyle").value.trim() || "futuristic funk",
      scenes: Array.from({ length: count }, (_, i) => ({
        scene: i + 1,
        startSeconds: Math.round(i * sceneLength * 10) / 10,
        durationSeconds: sceneLength,
        section: sections[i]?.match(/^\[([^\]]+)/)?.[1] || `Scene ${i + 1}`,
        direction: "Beat-synced camera motion, bold performance imagery, reactive lighting and rhythmic cuts."
      }))
    };
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c]));
  }

  loadConfig();
})();
