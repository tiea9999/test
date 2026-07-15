/**
 * TIEA IPTV V7.2 Alpha 2
 * Playback Engine
 * File: playback-engine-v72.js
 *
 * หน้าที่:
 * - เล่น HLS / DASH / Native
 * - Retry / Recover
 * - ไม่มี intent://, window.location หรือ External Player
 */
(function (global) {
  "use strict";

  const VERSION = "7.2.0-alpha.2";

  class PlaybackEngineV72 {
    constructor(video, options) {
      if (!(video instanceof HTMLVideoElement)) {
        throw new Error("ต้องส่ง HTMLVideoElement ให้ Playback Engine");
      }

      this.video = video;
      this.options = Object.assign({
        workerBase: "",
        autoPlay: true,
        maxRetries: 2,
        retryDelayMs: 1200,
        hlsConfig: {},
        onState: null,
        onError: null
      }, options || {});

      this.hls = null;
      this.shakaPlayer = null;
      this.retryCount = 0;
      this.sessionId = 0;
    }

    emitState(state, detail) {
      const payload = Object.assign({
        version: VERSION,
        state,
        at: Date.now()
      }, detail || {});

      if (typeof this.options.onState === "function") {
        this.options.onState(payload);
      }

      this.video.dispatchEvent(new CustomEvent("tiea-playback-state", {
        detail: payload
      }));
    }

    emitError(error, detail) {
      const payload = Object.assign({
        version: VERSION,
        message: error instanceof Error ? error.message : String(error),
        error
      }, detail || {});

      if (typeof this.options.onError === "function") {
        this.options.onError(payload);
      }

      this.video.dispatchEvent(new CustomEvent("tiea-playback-error", {
        detail: payload
      }));
    }

    async destroyPlayers() {
      if (this.hls) {
        try { this.hls.destroy(); } catch (_) {}
        this.hls = null;
      }

      if (this.shakaPlayer) {
        try { await this.shakaPlayer.destroy(); } catch (_) {}
        this.shakaPlayer = null;
      }

      this.video.pause();
      this.video.removeAttribute("src");
      this.video.load();
    }

    async play(source) {
      const sessionId = ++this.sessionId;
      this.retryCount = 0;

      const providerConfig = global.TIEAProviderEngineV72.analyze(source, {
        workerBase: this.options.workerBase
      });

      const finalUrl = global.TIEAWorkerBuilderV72.build(providerConfig, {
        workerBase: this.options.workerBase
      });

      const config = Object.assign({}, providerConfig, { finalUrl });

      await this.destroyPlayers();
      if (sessionId !== this.sessionId) return null;

      this.emitState("loading", {
        provider: config.provider,
        engine: config.engine,
        finalUrl: config.finalUrl,
        reason: config.reason
      });

      try {
        await this.playByEngine(config, sessionId);
        return config;
      } catch (error) {
        this.emitError(error, { provider: config.provider, engine: config.engine });
        throw error;
      }
    }

    async playByEngine(config, sessionId) {
      const engine = String(config.engine || config.streamType || "hls").toLowerCase();

      if (engine === "dash" || engine === "mpd") {
        return this.playDash(config, sessionId);
      }

      if (engine === "native" || engine === "mp4") {
        return this.playNative(config, sessionId);
      }

      return this.playHls(config, sessionId);
    }

    async startVideo() {
      if (!this.options.autoPlay) return;
      try {
        await this.video.play();
      } catch (error) {
        this.emitState("autoplay-blocked", { message: error.message });
      }
    }

    async playNative(config, sessionId) {
      if (sessionId !== this.sessionId) return;

      this.video.src = config.finalUrl;
      this.video.load();

      await new Promise((resolve, reject) => {
        const onReady = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error("Native video โหลดไม่สำเร็จ"));
        };
        const cleanup = () => {
          this.video.removeEventListener("loadedmetadata", onReady);
          this.video.removeEventListener("error", onError);
        };

        this.video.addEventListener("loadedmetadata", onReady, { once: true });
        this.video.addEventListener("error", onError, { once: true });
      });

      await this.startVideo();
      this.emitState("playing", { engine: "native" });
    }

    async playHls(config, sessionId) {
      if (sessionId !== this.sessionId) return;

      if (global.Hls && global.Hls.isSupported()) {
        await this.playWithHlsJs(config, sessionId);
        return;
      }

      if (this.video.canPlayType("application/vnd.apple.mpegurl")) {
        await this.playNative(config, sessionId);
        return;
      }

      throw new Error("อุปกรณ์นี้ไม่รองรับ HLS");
    }

    async playWithHlsJs(config, sessionId) {
      return new Promise((resolve, reject) => {
        const hls = new global.Hls(Object.assign({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 60,
          maxBufferLength: 30,
          manifestLoadingMaxRetry: 2,
          levelLoadingMaxRetry: 2,
          fragLoadingMaxRetry: 3
        }, this.options.hlsConfig || {}));

        this.hls = hls;

        const fail = async (error) => {
          if (sessionId !== this.sessionId) return;

          if (this.retryCount < this.options.maxRetries) {
            this.retryCount += 1;
            this.emitState("retrying", { attempt: this.retryCount });

            setTimeout(() => {
              if (sessionId !== this.sessionId) return;
              try {
                hls.stopLoad();
                hls.startLoad(-1);
              } catch (retryError) {
                reject(retryError);
              }
            }, this.options.retryDelayMs);
            return;
          }

          reject(error);
        };

        hls.on(global.Hls.Events.MEDIA_ATTACHED, () => {
          hls.loadSource(config.finalUrl);
        });

        hls.on(global.Hls.Events.MANIFEST_PARSED, async () => {
          if (sessionId !== this.sessionId) return;
          await this.startVideo();
          this.emitState("playing", {
            engine: "hls",
            provider: config.provider
          });
          resolve();
        });

        hls.on(global.Hls.Events.ERROR, (_, data) => {
          if (!data || !data.fatal) return;

          if (data.type === global.Hls.ErrorTypes.MEDIA_ERROR) {
            try {
              hls.recoverMediaError();
              this.emitState("recover-media-error");
              return;
            } catch (_) {}
          }

          fail(new Error(
            `HLS fatal: ${data.type || "unknown"} / ${data.details || "unknown"}`
          ));
        });

        hls.attachMedia(this.video);
      });
    }

    async playDash(config, sessionId) {
      if (sessionId !== this.sessionId) return;

      if (!global.shaka || !global.shaka.Player) {
        throw new Error("ไม่พบ Shaka Player");
      }

      global.shaka.polyfill.installAll();

      if (!global.shaka.Player.isBrowserSupported()) {
        throw new Error("Browser นี้ไม่รองรับ DASH/Shaka");
      }

      const player = new global.shaka.Player();
      await player.attach(this.video);
      this.shakaPlayer = player;

      const drmConfig = {};

      if (config.keyId && config.key) {
        drmConfig.clearKeys = {
          [config.keyId]: config.key
        };
      } else if (config.drm && config.drm.clearKeys) {
        drmConfig.clearKeys = config.drm.clearKeys;
      }

      if (Object.keys(drmConfig).length) {
        player.configure({ drm: drmConfig });
      }

      player.addEventListener("error", (event) => {
        const detail = event && event.detail;
        this.emitError(new Error(
          `Shaka error ${detail ? detail.code : "unknown"}`
        ));
      });

      await player.load(config.finalUrl);
      await this.startVideo();

      this.emitState("playing", {
        engine: "dash",
        provider: config.provider
      });
    }

    async stop() {
      ++this.sessionId;
      await this.destroyPlayers();
      this.emitState("stopped");
    }
  }

  global.TIEAPlaybackEngineV72 = PlaybackEngineV72;
})(window);
