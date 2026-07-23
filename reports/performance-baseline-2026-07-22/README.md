# Performance Baseline - 2026-07-22

Baseline for `https://barkandframe.com/` captured on July 22, 2026.

## Canonical PageSpeed Insights Baseline

Use this PageSpeed report as the canonical baseline for comparisons:

- Mobile report: https://pagespeed.web.dev/analysis/https-barkandframe-com/asxm9q9vj0?hl=en-US&form_factor=mobile
- Desktop report: https://pagespeed.web.dev/analysis/https-barkandframe-com/asxm9q9vj0?hl=en-US&form_factor=desktop
- Report timestamp: Jul 22, 2026, 4:54 PM GMT+2

### Mobile

- Performance: 68
- Accessibility: 94
- Best Practices: 73
- SEO: 100
- Agentic Browsing: 2/3
- FCP: 2.6 s
- LCP: 5.3 s
- TBT: 310 ms
- CLS: 0.039
- Speed Index: 4.1 s
- Environment: Emulated Moto G Power, Lighthouse 13.4.0, Slow 4G throttling

### Desktop

- Performance: 79
- Accessibility: 86
- Best Practices: 73
- SEO: 100
- Agentic Browsing: 2/3
- FCP: 0.5 s
- LCP: 1.3 s
- TBT: 400 ms
- CLS: 0.029
- Speed Index: 1.2 s
- Environment: Emulated Desktop, Lighthouse 13.4.0, custom throttling

## Captured Files

- `homepage-mobile.png` - live homepage first viewport at 390x844
- `homepage-desktop.png` - live homepage first viewport at 1440x900
- `live-assets-mobile.json` - browser-observed live asset inventory for mobile viewport
- `live-assets-desktop.json` - browser-observed live asset inventory for desktop viewport
- `psi-mobile-canonical-result.png` - screenshot of the canonical mobile PSI report
- `psi-desktop-canonical-result.png` - screenshot of the canonical desktop PSI report
- `psi-mobile-canonical-dom-snapshot.txt` - extracted mobile PSI report DOM
- `psi-desktop-canonical-dom-snapshot.txt` - extracted desktop PSI report DOM

## Live Asset Inventory Summary

### Mobile Viewport

- Browser inventory total assets: 267
- Scripts: 174
- Stylesheets: 30
- Images: 44
- Fonts: 4
- Other: 15
- Inline SVGs: 114
- DOM counts: 66 script tags, 125 link tags, 99 images, 29 source tags
- Cookie banner visible during capture: no

### Desktop Viewport

- Browser inventory total assets: 266
- Scripts: 174
- Stylesheets: 30
- Images: 43
- Fonts: 4
- Other: 15
- Inline SVGs: 114
- DOM counts: 66 script tags, 125 link tags, 99 images, 29 source tags
- Cookie banner visible during capture: no

## Notes On Score Variance

An additional PageSpeed run made at Jul 22, 2026, 4:57 PM GMT+2 returned mobile Performance 59. It is stored only as a variance reference in `psi-mobile-dom-snapshot.txt` and `psi-mobile-result.png`.

The difference was driven mainly by LCP:

- Canonical mobile run: LCP 5.3 s, FCP 2.6 s, TBT 310 ms, score 68
- Additional mobile run: LCP 15.8 s, FCP 4.7 s, TBT 140 ms, score 59

For optimization decisions, compare against the canonical `asxm9q9vj0` report unless a later repeated measurement confirms a new baseline.
