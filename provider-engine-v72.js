/**
 * TIEA IPTV V7.2 Alpha 2
 * Dynamic Provider Engine
 * File: provider-engine-v72.js
 *
 * หน้าที่:
 * - วิเคราะห์ URL / Provider / Stream Type
 * - เลือก Direct หรือ Worker
 * - เตรียม Referer / DRM config
 *
 * ไม่มีโค้ดเล่นวิดีโอในไฟล์นี้
 */
(function (global) {
  "use strict";

  const VERSION = "7.2.0-alpha.2";

  function safeUrl(input) {
    try {
      return new URL(String(input || "").trim());
    } catch (_) {
      return null;
    }
  }

  function cleanText(value) {
    return String(value || "").trim();
  }

  function detectStreamType(url, data) {
    const lower = cleanText(url).toLowerCase();

    if (data && (data.keyId || data.key || data.drm)) return "dash";
    if (/\.mpd(?:$|\?)/i.test(lower)) return "dash";
    if (/\.m3u8(?:$|\?)/i.test(lower)) return "hls";
    if (/\.(mp4|m4v|webm|mov)(?:$|\?)/i.test(lower)) return "native";
    return "hls";
  }

  function makeResult(source, overrides) {
    const rawUrl = cleanText(source.url || source.src);
    const parsed = safeUrl(rawUrl);
    const host = parsed ? parsed.hostname.toLowerCase() : "";

    return Object.assign({
      version: VERSION,
      originalUrl: rawUrl,
      playbackUrl: rawUrl,
      provider: "generic",
      host,
      streamType: detectStreamType(rawUrl, source),
      engine: detectStreamType(rawUrl, source),
      useWorker: false,
      workerMode: "proxy",
      referer: cleanText(source.referer),
      userAgent: cleanText(source.userAgent),
      headers: Object.assign({}, source.headers || {}),
      drm: source.drm || null,
      keyId: cleanText(source.keyId),
      key: cleanText(source.key),
      reason: "generic direct rule",
      metadata: Object.assign({}, source.metadata || {})
    }, overrides || {});
  }

  function inferGetPlayReferer(parsed, source) {
    if (source.referer) return cleanText(source.referer);

    const pathname = parsed ? parsed.pathname : "";
    const match = pathname.match(/\/api\/stream\/([^/]+)/i);
    if (!match) return "https://getplay-cdn.com/";

    return `https://getplay-cdn.com/embed/${match[1]}`;
  }

  const rules = [
    {
      id: "already-worker",
      match: ({ parsed, settings }) => {
        if (!parsed) return false;
        const workerHost = safeUrl(settings.workerBase || "");
        return workerHost && parsed.hostname === workerHost.hostname;
      },
      build: ({ source }) => makeResult(source, {
        provider: "worker",
        useWorker: false,
        reason: "URL is already a Worker URL"
      })
    },
    {
      id: "getplay",
      match: ({ host }) => host.includes("getplay-cdn.com"),
      build: ({ source, parsed }) => makeResult(source, {
        provider: "getplay",
        useWorker: true,
        referer: inferGetPlayReferer(parsed, source),
        reason: "GetPlay requires referer/proxy in browser playback"
      })
    },
    {
      id: "livedoomovies",
      match: ({ host }) =>
        host.includes("livedoomovies.com") ||
        host.includes("live.livedoomovies.com"),
      build: ({ source }) => makeResult(source, {
        provider: "livedoomovies",
        useWorker: true,
        referer: cleanText(source.referer) || "https://livedoomovies.com/",
        reason: "LiveDooMovies Worker recommended"
      })
    },
    {
      id: "6395",
      match: ({ host }) =>
        host.includes("6395online.com") ||
        host.includes("gold.6395online.com"),
      build: ({ source, parsed }) => {
        let playbackUrl = cleanText(source.url || source.src);

        if (parsed && parsed.hostname.includes("6395online.com")) {
          parsed.protocol = "http:";
          parsed.hostname = "gold.6395online.com";
          parsed.port = "8080";
          playbackUrl = parsed.toString();
        }

        return makeResult(source, {
          provider: "6395",
          playbackUrl,
          useWorker: true,
          referer: cleanText(source.referer) || "http://gold.6395online.com:8080/",
          reason: "6395 host normalization + referer"
        });
      }
    },
    {
      id: "3bb",
      match: ({ host, source }) =>
        host.includes("3bbtv.com") ||
        /\.mpd(?:$|\?)/i.test(cleanText(source.url || source.src)),
      build: ({ source }) => makeResult(source, {
        provider: "3bb",
        streamType: "dash",
        engine: "dash",
        useWorker: Boolean(source.useWorker),
        reason: source.keyId && source.key
          ? "DASH ClearKey"
          : "DASH stream"
      })
    },
    {
      id: "flixmono",
      match: ({ host }) => host.includes("flixmono"),
      build: ({ source }) => makeResult(source, {
        provider: "flixmono",
        useWorker: true,
        reason: "Flixmono proxy rule"
      })
    },
    {
      id: "goseries",
      match: ({ host }) => host.includes("goseries"),
      build: ({ source }) => makeResult(source, {
        provider: "goseries",
        useWorker: true,
        reason: "GoSeries proxy rule"
      })
    }
  ];

  function analyze(source, settings) {
    const normalizedSource = typeof source === "string" ? { url: source } : (source || {});
    const parsed = safeUrl(normalizedSource.url || normalizedSource.src);
    const host = parsed ? parsed.hostname.toLowerCase() : "";
    const config = Object.assign({
      workerBase: "",
      forceWorker: false,
      forceDirect: false
    }, settings || {});

    if (!parsed) {
      throw new Error("URL ไม่ถูกต้อง");
    }

    let result = null;

    for (const rule of rules) {
      if (rule.match({ source: normalizedSource, parsed, host, settings: config })) {
        result = rule.build({ source: normalizedSource, parsed, host, settings: config });
        break;
      }
    }

    if (!result) {
      result = makeResult(normalizedSource, {
        reason: "No provider-specific rule matched"
      });
    }

    if (normalizedSource.useWorker === true || config.forceWorker === true) {
      result.useWorker = true;
      result.reason += " | forced Worker";
    }

    if (normalizedSource.useWorker === false || config.forceDirect === true) {
      result.useWorker = false;
      result.reason += " | forced Direct";
    }

    if (normalizedSource.engine) {
      result.engine = cleanText(normalizedSource.engine).toLowerCase();
    }

    if (normalizedSource.type) {
      result.streamType = cleanText(normalizedSource.type).toLowerCase();
    }

    return result;
  }

  function addRule(rule) {
    if (!rule || typeof rule.match !== "function" || typeof rule.build !== "function") {
      throw new Error("Provider rule ไม่ถูกต้อง");
    }
    rules.unshift(rule);
  }

  global.TIEAProviderEngineV72 = Object.freeze({
    version: VERSION,
    analyze,
    addRule
  });
})(window);
