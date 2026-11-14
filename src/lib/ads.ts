/**
 * AdMob(네이티브에서만). 웹/개발에서는 아무것도 하지 않는다.
 * 실제 광고 ID 는 VITE_ADMOB_BANNER_ID / VITE_ADMOB_INTERSTITIAL_ID. 없으면 구글 테스트 ID.
 */
import { Capacitor } from "@capacitor/core";
import { AdMob, BannerAdPluginEvents, BannerAdPosition, BannerAdSize } from "@capacitor-community/admob";

const TEST_BANNER = "ca-app-pub-3940256099942544/6300978111";
const TEST_INTERSTITIAL = "ca-app-pub-3940256099942544/1033173712";
const BANNER_ID = (import.meta.env.VITE_ADMOB_BANNER_ID as string | undefined) || TEST_BANNER;
const INTER_ID = (import.meta.env.VITE_ADMOB_INTERSTITIAL_ID as string | undefined) || TEST_INTERSTITIAL;
const TESTING = BANNER_ID === TEST_BANNER;
/** 상세 열람 N번마다 전면광고 1회 */
export const INTERSTITIAL_EVERY = 4;

let ready = false;
let interstitialReady = false;

export async function initAds(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await AdMob.initialize({ initializeForTesting: TESTING });
    AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size: { height: number }) => {
      document.documentElement.style.setProperty("--ad-h", `${size.height}px`);
    });
    await AdMob.showBanner({
      adId: BANNER_ID,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: TESTING,
    });
    ready = true;
    void prepareInterstitial();
    return true;
  } catch (e) {
    console.warn("ads init failed", e);
    return false;
  }
}

async function prepareInterstitial() {
  if (!ready) return;
  try {
    await AdMob.prepareInterstitial({ adId: INTER_ID, isTesting: TESTING });
    interstitialReady = true;
  } catch (e) {
    console.warn("interstitial prepare failed", e);
  }
}

/** 상세 열람 카운트 기준으로 전면광고를 띄운다. 띄웠으면 true */
export async function maybeShowInterstitial(detailViews: number): Promise<boolean> {
  if (!ready || !interstitialReady) return false;
  if (detailViews % INTERSTITIAL_EVERY !== 0) return false;
  try {
    await AdMob.showInterstitial();
    interstitialReady = false;
    setTimeout(() => void prepareInterstitial(), 3000);
    return true;
  } catch (e) {
    console.warn("interstitial show failed", e);
    return false;
  }
}
