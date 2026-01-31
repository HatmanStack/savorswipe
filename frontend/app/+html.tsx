import React, { type PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

/**
 * This file is web-only and used to configure the root HTML for every web page during static rendering.
 * The contents of this function only run in Node.js environments and do not have access to the DOM or browser APIs.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/* SEO Meta Tags */}
        <title>SavorSwipe - From Cravings to Cooking</title>
        <meta name="description" content="Swipe through delicious recipes, discover new dishes, and start cooking! SavorSwipe makes recipe discovery fun with swipe-based browsing and ingredient search." />
        <link rel="canonical" href="https://savorswipe.hatstack.fun" />
        <meta name="robots" content="index, follow" />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="SavorSwipe" />
        <meta property="og:title" content="SavorSwipe - From Cravings to Cooking" />
        <meta property="og:description" content="Swipe through delicious recipes, discover new dishes, and start cooking! Recipe discovery made fun." />
        <meta property="og:url" content="https://savorswipe.hatstack.fun" />
        <meta property="og:image" content="https://savorswipe.hatstack.fun/og-image.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:locale" content="en_US" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="SavorSwipe - From Cravings to Cooking" />
        <meta name="twitter:description" content="Swipe through delicious recipes, discover new dishes, and start cooking!" />
        <meta name="twitter:image" content="https://savorswipe.hatstack.fun/og-image.jpg" />

        {/* PWA & Mobile */}
        <meta name="theme-color" content="#ffffff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="SavorSwipe" />

        {/* WebSite JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'SavorSwipe',
              url: 'https://savorswipe.hatstack.fun',
              description: 'From Cravings to Cooking - Swipe, Discover, Repeat!',
              potentialAction: {
                '@type': 'SearchAction',
                target: 'https://savorswipe.hatstack.fun/search?q={search_term_string}',
                'query-input': 'required name=search_term_string',
              },
            }),
          }}
        />

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
body {
  background-color: #fff;
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: #000;
  }
}`;
