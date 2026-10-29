// The drum samples come from a CDN (smpldsnds.github.io). A rate-limited, failed or CORS-blocked
// download is the network's, not the page's: the player stays silent and retries on the next Play.
// Console and page-error messages about it are ignored by the tests that assert "nothing throws".
export const isCdnNoise = (message: string): boolean =>
  /smpldsnds|access control checks|Failed to load resource|net::|NetworkError|Load failed|Failed to fetch|CORS|Access-Control-Allow-Origin/i.test(message);
