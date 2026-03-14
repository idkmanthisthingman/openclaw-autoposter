import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOKIES_PATH = join(__dirname, '..', 'state', 'cookies.json');

const BEARER_TOKEN = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

const CREATE_TWEET_URL = 'https://x.com/i/api/graphql/ZumXEfvjHvt55CBVLR_DBA/CreateTweet';

const FEATURES = {
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  articles_preview_enabled: true,
  rweb_video_timestamps_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_enhance_cards_enabled: false,
  responsive_web_media_download_video_enabled: false,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_text_conversations_enabled: true,
  interactive_text_enabled: true,
  blue_business_profile_image_shape_enabled: true,
};

let browserInstance = null;
let pageInstance = null;

function loadCookies() {
  if (!existsSync(COOKIES_PATH)) throw new Error('No cookies.json found');
  const raw = JSON.parse(readFileSync(COOKIES_PATH, 'utf-8'));
  return raw.map((c) => ({
    name: c.key || c.name,
    value: c.value,
    domain: '.x.com',
    path: c.path || '/',
    secure: c.secure !== false,
    httpOnly: c.httpOnly || false,
    sameSite: ['Strict', 'Lax', 'None'].includes(c.sameSite) ? c.sameSite : 'None',
  }));
}

async function getBrowserPage() {
  if (pageInstance) return pageInstance;

  browserInstance = await chromium.launch({ headless: true });
  const context = await browserInstance.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3.1 Safari/605.1.15',
  });

  const cookies = loadCookies();
  await context.addCookies(cookies);

  pageInstance = await context.newPage();
  // Navigate to x.com to establish the session context
  await pageInstance.goto('https://x.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Wait a bit for session to settle
  await pageInstance.waitForTimeout(2000);

  return pageInstance;
}

export async function browserSendTweet(text) {
  const page = await getBrowserPage();

  // Get the csrf token from cookies
  const cookies = await page.context().cookies('https://x.com');
  const ct0 = cookies.find((c) => c.name === 'ct0');
  if (!ct0) throw new Error('ct0 cookie not found — session invalid');

  const result = await page.evaluate(
    async ({ url, bearer, csrf, features, tweetText }) => {
      const variables = {
        tweet_text: tweetText,
        dark_request: false,
        media: { media_entities: [], possibly_sensitive: false },
        semantic_annotation_ids: [],
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${bearer}`,
          'content-type': 'application/json',
          'x-csrf-token': csrf,
          'x-twitter-auth-type': 'OAuth2Session',
          'x-twitter-active-user': 'yes',
          'x-twitter-client-language': 'en',
        },
        body: JSON.stringify({
          variables,
          features,
          queryId: 'ZumXEfvjHvt55CBVLR_DBA',
        }),
        credentials: 'include',
      });

      const data = await resp.json();
      return { status: resp.status, data };
    },
    {
      url: CREATE_TWEET_URL,
      bearer: decodeURIComponent(BEARER_TOKEN),
      csrf: ct0.value,
      features: FEATURES,
      tweetText: text,
    }
  );

  if (result.status !== 200) {
    throw new Error(`CreateTweet failed (${result.status}): ${JSON.stringify(result.data)}`);
  }

  const tweetId =
    result.data?.data?.create_tweet?.tweet_results?.result?.rest_id || null;

  return tweetId;
}

export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
    pageInstance = null;
  }
}
