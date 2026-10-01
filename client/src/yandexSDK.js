/**
 * KONTIR — Yandex Games SDK (v2) Integration
 * 
 * Moderation requirements & features:
 * - YaGames.init() loading & window.ysdk assignment
 * - LoadingAPI.ready() notification
 * - Audio mute/pause and controller unlock on ad display
 * - Audio unmute/resume on ad dismissal
 * - Fullscreen (Interstitial) ad with moderation cooldown
 * - Rewarded video ads with strict onRewarded callback verification
 * - GameplayAPI start/stop callbacks for Yandex session tracking
 * - Safe fallbacks for offline, localhost, and adblockers
 */

/** SDK methods may return promises that reject (offline, closed frame): never leave them unhandled. */
const settle = r => { if (r && typeof r.catch === 'function') r.catch(e => console.warn('[YandexSDK]', e?.message || e)); };

export class YandexSDK {
  constructor() {
    this.ysdk = null;
    this.initialized = false;
    this.audio = null;
    this.controller = null;
    this.lastFullscreenTime = 0;
    this.FULLSCREEN_COOLDOWN_MS = 60 * 1000; // 60s cooldown between interstitials
    this.wasAudioPausedByAd = false;
  }

  /**
   * Initializes Yandex Games SDK if running inside Yandex Games iframe.
   * Safe to call in standalone local dev environments.
   */
  async init({ audio = null, controller = null } = {}) {
    this.audio = audio;
    this.controller = controller;

    if (typeof window === 'undefined') return null;

    if (window.ysdk) {
      this.ysdk = window.ysdk;
      this.initialized = true;
      return this.ysdk;
    }

    // index.html loads the SDK script only inside the Yandex Games iframe: outside it every SDK call rejects with
    // "No parent to post message" (unhandled errors on localhost / Render hosting).
    if (window.__ysdkScript) await window.__ysdkScript;
    if (typeof window.YaGames === 'undefined') {
      console.log('[YandexSDK] YaGames SDK topilmadi — lokal/avtonom rejimda ishlamoqda.');
      return null;
    }

    try {
      const ysdk = await window.YaGames.init();
      window.ysdk = ysdk;
      this.ysdk = ysdk;
      this.initialized = true;
      console.log('[YandexSDK] Yandex Games SDK v2 muvaffaqiyatli yuklandi.');

      // Notify Yandex Games that initial assets are ready
      try {
        settle(ysdk.features.LoadingAPI?.ready());
      } catch (e) {
        console.warn('[YandexSDK] LoadingAPI.ready xatolik:', e);
      }

      // Moderation requirement 2.14: Automatic language detection via ysdk.environment.i18n.lang
      try {
        const lang = ysdk.environment?.i18n?.lang;
        if (lang) {
          console.log('[YandexSDK] Yandex Games SDK aniqlagan til (п. 2.14):', lang);
          if (typeof window !== 'undefined' && typeof window.applyYandexLanguage === 'function') {
            window.applyYandexLanguage(lang);
          }
        }
      } catch (e) {
        console.warn('[YandexSDK] i18n.lang detection xatosi:', e);
      }

      return ysdk;
    } catch (err) {
      console.warn('[YandexSDK] Initsializatsiya xatosi:', err);
      return null;
    }
  }

  /**
   * Returns current language code from Yandex Games SDK environment (e.g. 'ru', 'en', 'tr', 'uz').
   * Complies with Yandex Games Requirement 2.14.
   * @returns {string|null}
   */
  getLanguage() {
    return this.ysdk?.environment?.i18n?.lang || null;
  }

  /**
   * Automatically pause game & mute audio when an ad opens.
   */
  pauseForAd() {
    try {
      if (this.controller?.locked) {
        this.controller.unlock();
      }
      if (this.audio) {
        this.audio.mute?.();
        this.audio.pause?.();
        this.wasAudioPausedByAd = true;
      }
    } catch (e) {
      console.warn('[YandexSDK] pauseForAd:', e);
    }
  }

  /**
   * Automatically resume game & restore audio when an ad closes.
   */
  resumeAfterAd() {
    try {
      if (this.audio && this.wasAudioPausedByAd) {
        this.audio.unmute?.();
        this.audio.resume?.();
        this.wasAudioPausedByAd = false;
      }
    } catch (e) {
      console.warn('[YandexSDK] resumeAfterAd:', e);
    }
  }

  /**
   * Shows a Fullscreen (Interstitial) Ad with rate-limiting.
   * @param {function(boolean): void} [callback] - Called with true if ad was displayed, false otherwise.
   */
  showFullscreenAd(callback) {
    const now = Date.now();
    if (now - this.lastFullscreenTime < this.FULLSCREEN_COOLDOWN_MS) {
      // Cooldown active, skip quietly to comply with Yandex moderation
      if (typeof callback === 'function') callback(false);
      return;
    }

    if (!this.ysdk?.adv?.showFullscreenAdv) {
      if (typeof callback === 'function') callback(false);
      return;
    }

    let finished = false;
    const finish = (shown) => {
      if (finished) return;
      finished = true;
      this.lastFullscreenTime = Date.now();
      this.resumeAfterAd();
      if (typeof callback === 'function') callback(shown);
    };

    this.pauseForAd();

    try {
      this.ysdk.adv.showFullscreenAdv({
        callbacks: {
          onOpen: () => {
            this.pauseForAd();
          },
          onClose: (wasShown) => {
            finish(!!wasShown);
          },
          onError: (err) => {
            console.warn('[YandexSDK] showFullscreenAdv onError:', err);
            finish(false);
          },
          onOffline: () => {
            finish(false);
          }
        }
      });
    } catch (e) {
      console.warn('[YandexSDK] showFullscreenAdv exception:', e);
      finish(false);
    }
  }

  /**
   * Shows a Rewarded Video Ad.
   * Grants reward ONLY when the onRewarded callback executes.
   * @param {Object} options
   * @param {function(): void} options.onRewarded - Triggered ONLY when player watches the complete ad.
   * @param {function(Error): void} [options.onError] - Triggered if ad fails to load.
   * @param {function(boolean): void} [options.onClose] - Triggered when ad closes (boolean: was rewarded).
   */
  showRewardedAd({ onRewarded, onError, onClose } = {}) {
    if (!this.ysdk?.adv?.showRewardedVideo) {
      const err = new Error('Reklama tizimi mavjud emas (adblock yoki lokal rejim).');
      if (typeof onError === 'function') onError(err);
      if (typeof onClose === 'function') onClose(false);
      return;
    }

    let rewarded = false;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      this.resumeAfterAd();
      if (typeof onClose === 'function') onClose(rewarded);
    };

    this.pauseForAd();

    try {
      this.ysdk.adv.showRewardedVideo({
        callbacks: {
          onOpen: () => {
            this.pauseForAd();
          },
          onRewarded: () => {
            rewarded = true;
            try {
              if (typeof onRewarded === 'function') onRewarded();
            } catch (e) {
              console.error('[YandexSDK] onRewarded error:', e);
            }
          },
          onClose: () => {
            finish();
          },
          onError: (err) => {
            console.warn('[YandexSDK] showRewardedVideo onError:', err);
            if (typeof onError === 'function') onError(err);
            finish();
          }
        }
      });
    } catch (e) {
      console.warn('[YandexSDK] showRewardedVideo exception:', e);
      if (typeof onError === 'function') onError(e);
      finish();
    }
  }

  /**
   * Yandex moderation: Call when entering active gameplay match.
   */
  gameplayStart() {
    try {
      settle(this.ysdk?.features?.GameplayAPI?.start());
    } catch {
      // Safe fallback
    }
  }

  /**
   * Yandex moderation: Call when exiting match or opening pause menu.
   */
  gameplayStop() {
    try {
      settle(this.ysdk?.features?.GameplayAPI?.stop());
    } catch {
      // Safe fallback
    }
  }

  isAvailable() {
    return !!(this.ysdk && this.initialized);
  }
}

export const yandexSDK = new YandexSDK();
