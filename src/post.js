import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { fetchImageForPost } from './images.js';
import { loadState, saveState, recordPostedTweetId } from './state.js';
import { sleep, randomJitter, createAuthenticatedScraper, saveCookies } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DRY_RUN = process.env.DRY_RUN === '1';

async function postTweet(scraper, post, includeImage) {
  let mediaData;

  if (includeImage) {
    const image = await fetchImageForPost(post);
    if (image) {
      mediaData = [{ data: image.buffer, mediaType: image.mimeType }];
    }
  }

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would post: "${post.text}"`);
    if (mediaData) console.log(`[DRY RUN] With image attached.`);
    return;
  }

  const result = await scraper.sendTweet(post.text, undefined, mediaData);
  const tweetId =
    result?.id_str ||
    result?.data?.create_tweet?.tweet_results?.result?.rest_id ||
    null;
  console.log(`Posted: "${post.text.slice(0, 80)}..." ${mediaData ? '(with image)' : '(text-only)'}${tweetId ? ` [id:${tweetId}]` : ''}`);
  return tweetId;
}

async function main() {
  const batchArg = process.argv.includes('--batch')
    ? process.argv[process.argv.indexOf('--batch') + 1]
    : 'morning';

  const batchFile = join(ROOT, 'state', `batch-${batchArg}.json`);
  if (!existsSync(batchFile)) {
    console.error(`No batch file found: ${batchFile}`);
    console.error('Run generate.js first: node src/generate.js --batch ' + batchArg);
    process.exit(1);
  }

  const posts = JSON.parse(readFileSync(batchFile, 'utf-8'));
  console.log(`Loaded ${posts.length} posts from ${batchArg} batch.`);

  if (DRY_RUN) {
    console.log('=== DRY RUN MODE ===');
    for (const post of posts) {
      await postTweet(null, post, false);
    }
    console.log('=== DRY RUN COMPLETE ===');
    return;
  }

  const scraper = await createAuthenticatedScraper();
  const state = loadState();

  // Post with 30-45 min gaps between tweets
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const includeImage = Math.random() < 0.8; // 80% of posts get images

    try {
      const tweetId = await postTweet(scraper, post, includeImage);
      if (tweetId) {
        recordPostedTweetId(state, tweetId, post);
        saveState(state);
      }
    } catch (err) {
      console.error(`Failed to post: ${err.message}`);
      continue;
    }

    // Wait between posts (skip after last one)
    if (i < posts.length - 1) {
      const waitMs = randomJitter(30 * 60 * 1000, 15 * 60 * 1000); // 30-45 min
      console.log(`Waiting ${Math.round(waitMs / 60000)} minutes before next post...`);
      await sleep(waitMs);
    }
  }

  // Save cookies for next run
  await saveCookies(scraper);
  console.log('Batch complete.');
}

main().catch((err) => {
  console.error('Posting failed:', err.message);
  process.exit(1);
});
