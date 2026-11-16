/* ============================================================
   Платформенный адаптер: VK Mini Apps / VK Games + веб-фолбэк
   ============================================================ */
'use strict';

const Platform = (function () {
  const bridge = (typeof window !== 'undefined') ? (window.vkBridge || window.VKBridge || null) : null;
  let isVK = false;
  let launchParams = null;

  function send(method, params) {
    return new Promise(function (resolve, reject) {
      if (!bridge) { reject(new Error('VK Bridge недоступен')); return; }
      bridge.send(method, params || {}).then(resolve).catch(reject);
    });
  }

  async function init() {
    if (!bridge) return false;
    try {
      await send('VKWebAppInit');
      isVK = true;
      try { launchParams = await send('VKWebAppGetLaunchParams'); } catch (e) { }
    } catch (e) {
      isVK = false;
    }
    return isVK;
  }

  function isAvailable() { return isVK; }

  // Реклама за вознаграждение. onDone(success)
  function showRewarded(onDone) {
    if (!isVK) { onDone && onDone(false); return; }
    send('VKWebAppShowNativeAds', { ad_format: 'reward' })
      .then(function (r) { onDone && onDone(!!(r && r.result)); })
      .catch(function () { onDone && onDone(false); });
  }

  // Показ баннерной/межстраничной рекламы (по желанию)
  function showInterstitial(onDone) {
    if (!isVK) { onDone && onDone(false); return; }
    send('VKWebAppShowNativeAds', { ad_format: 'interstitial' })
      .then(function (r) { onDone && onDone(!!(r && r.result)); })
      .catch(function () { onDone && onDone(false); });
  }

  function share(link, text) {
    if (!isVK) return Promise.reject(new Error('не VK'));
    return send('VKWebAppShare', { link: link || location.href, text: text || '' });
  }

  // Окно приглашения друзей; фолбэк — шеринг ссылки
  function invite() {
    if (!isVK) return Promise.reject(new Error('не VK'));
    return send('VKWebAppShowInviteBox').catch(function () {
      return send('VKWebAppShare', { link: location.href });
    });
  }

  function addToHomeScreen() {
    if (!isVK) return Promise.reject(new Error('не VK'));
    return send('VKWebAppAddToHomeScreen');
  }

  function getUserInfo() {
    if (!isVK) return Promise.reject(new Error('не VK'));
    return send('VKWebAppGetUserInfo').catch(function () { return null; });
  }

  return {
    init,
    isAvailable,
    showRewarded,
    showInterstitial,
    share,
    invite,
    addToHomeScreen,
    getUserInfo,
    getLaunchParams: function () { return launchParams; },
    hasBridge: !!bridge,
  };
})();