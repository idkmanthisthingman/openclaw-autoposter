import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { browserSendTweet, closeBrowser } from './browser-post.js';
import { loadState, saveState, recordPostedTweetId } from './state.js';
import { sleep, randomJitter } from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DRY_RUN = process.env.DRY_RUN === '1';

async function postTweet(post) {
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would post: "${post.text}"`);
    return;
  }

  const tweetId = await browserSendTweet(post.text);
  console.log(`Posted: "${post.text.slice(0, 80)}..." ${tweetId ? `[id:${tweetId}]` : ''}`);
  return tweetId;
}

async function main() {
  const batchArg = process.argv.includes('--batch')
    ? process.argv[process.argv.indexOf('--batch') + 1]
    : 'morning';

  const indexArg = process.argv.includes('--index')
    ? parseInt(process.argv[process.argv.indexOf('--index') + 1], 10)
    : null;

  const batchFile = join(ROOT, 'state', `batch-${batchArg}.json`);
  if (!existsSync(batchFile)) {
    console.error(`No batch file found: ${batchFile}`);
    console.error('Run generate.js first: node src/generate.js --batch ' + batchArg);
    process.exit(1);
  }

  const allPosts = JSON.parse(readFileSync(batchFile, 'utf-8'));

  // --index N: post only that one tweet (no sleep). Used by per-tweet cron jobs.
  const posts = indexArg !== null ? [allPosts[indexArg]].filter(Boolean) : allPosts;

  if (indexArg !== null && posts.length === 0) {
    console.log(`No tweet at index ${indexArg} in ${batchArg} batch (has ${allPosts.length}). Skipping.`);
    process.exit(0);
  }

  console.log(`Posting ${posts.length} tweet(s) from ${batchArg} batch${indexArg !== null ? ` (index ${indexArg})` : ''}.`);

  if (DRY_RUN) {
    for (const post of posts) {
      await postTweet(post);
    }
    console.log('=== DRY RUN COMPLETE ===');
    return;
  }

  const state = loadState();

  try {
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];

      try {
        const tweetId = await postTweet(post);
        if (tweetId) {
          recordPostedTweetId(state, tweetId, post);
          saveState(state);
        }
      } catch (err) {
        console.error(`Failed to post: ${err.message}`);
        continue;
      }

      // Sleep only when posting all tweets in one run (no --index), skip after last
      if (indexArg === null && i < posts.length - 1) {
        const waitMs = randomJitter(30 * 60 * 1000, 15 * 60 * 1000); // 30-45 min
        console.log(`Waiting ${Math.round(waitMs / 60000)} minutes before next post...`);
        await sleep(waitMs);
      }
    }
  } finally {
    await closeBrowser();
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error('Posting failed:', err.message);
  process.exit(1);
});
