# Suno Master Fixer

A mobile-first, local-processing web app for iPhone and desktop browsers.

## Run locally

Serve the folder over HTTPS or localhost. Examples:

- `python3 -m http.server 8080`
- Deploy the folder to Netlify, Vercel, Cloudflare Pages, GitHub Pages, or any static host.

## iPhone install

Open the hosted URL in Safari, tap Share, then **Add to Home Screen**.

## Notes

- Audio is processed entirely in the browser.
- Export is stereo 24-bit PCM WAV.
- Longer files need more RAM; closing other iPhone apps may help.
- Browser mastering is useful, but it is not stem-aware and cannot fully remove source artifacts already baked into a mix.
