/**
 * TIEA IPTV V7.2 Alpha 2
 * Worker URL Builder
 * File: worker-builder-v72.js
 *
 * หน้าที่:
 * - รับ Provider config
 * - สร้าง Worker URL เพียงครั้งเดียว
 * - ป้องกัน Worker ซ้อน Worker
 */
(function (global) {
  "use strict";

  const VERSION = "7.2.0-alpha.2";

  function normalizeWorkerBase(workerBase) {
    const value = String(workerBase || "").trim();
    if (!value) throw new Error("ยังไม่ได้ตั้งค่า Worker URL");

    const url = new URL(value);
    url.hash = "";
    return url;
  }

  function isAlreadyWorker(targetUrl, workerBase) {
    try {
      const target = new URL(targetUrl);
      const worker = normalizeWorkerBase(workerBase);
      return target.hostname === worker.hostname;
    } catch (_) {
      return false;
    }
  }

  function build(config, options) {
    if (!config || !config.playbackUrl) {
      throw new Error("ไม่มี playbackUrl สำหรับสร้าง Worker URL");
    }

    const settings = Object.assign({
      workerBase: "",
      encode: true,
      includeReferer: true,
      includeUserAgent: true
    }, options || {});

    if (!config.useWorker || isAlreadyWorker(config.playbackUrl, settings.workerBase)) {
      return config.playbackUrl;
    }

    const worker = normalizeWorkerBase(settings.workerBase);
    worker.search = "";

    worker.searchParams.set("url", config.playbackUrl);

    if (settings.includeReferer && config.referer) {
      worker.searchParams.set("referer", config.referer);
    }

    if (settings.includeUserAgent && config.userAgent) {
      worker.searchParams.set("userAgent", config.userAgent);
    }

    return worker.toString();
  }

  global.TIEAWorkerBuilderV72 = Object.freeze({
    version: VERSION,
    build,
    isAlreadyWorker
  });
})(window);
