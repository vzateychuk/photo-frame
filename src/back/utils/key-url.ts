/** Slideshow URL with an access key query parameter. */
export function buildKeySlideshowUrl(
  publicBaseUrl: string,
  key: string,
): string {
  const root = publicBaseUrl.replace(/\/$/, '');
  const url = new URL(`${root}/`);
  url.searchParams.set('key', key);
  return url.toString();
}
