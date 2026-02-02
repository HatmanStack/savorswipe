#!/usr/bin/env node

/**
 * Sitemap Generator for SavorSwipe
 *
 * Generates a complete sitemap.xml including:
 * - Static pages (home, search)
 * - All recipe pages from combined_data.json
 *
 * Usage:
 *   node scripts/generate-sitemap.js [options]
 *
 * Options:
 *   --url <url>     Site URL (default: https://savorswipe.hatstack.fun)
 *   --api <url>     Fetch recipes from API instead of local file
 *   --local         Use local starter_data (default)
 *
 * Examples:
 *   node scripts/generate-sitemap.js
 *   node scripts/generate-sitemap.js --api https://api.savorswipe.hatstack.fun/recipes
 *   node scripts/generate-sitemap.js --url https://mysite.com
 */

const fs = require('fs');
const path = require('path');

// Configuration
const FRONTEND_DIR = path.join(__dirname, '..');
const STARTER_DATA_PATH = path.join(FRONTEND_DIR, 'assets', 'starter_data', 'combined_data.json');
const OUTPUT_PATH = path.join(FRONTEND_DIR, 'public', 'sitemap.xml');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    siteUrl: process.env.SITE_URL || 'https://savorswipe.hatstack.fun',
    apiUrl: process.env.EXPO_PUBLIC_API_GATEWAY_URL || null,
    useApi: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      config.siteUrl = args[i + 1];
      i++;
    } else if (args[i] === '--api' && args[i + 1]) {
      config.apiUrl = args[i + 1];
      config.useApi = true;
      i++;
    } else if (args[i] === '--api') {
      config.useApi = true;
    } else if (args[i] === '--local') {
      config.useApi = false;
    }
  }

  // Remove trailing slash
  config.siteUrl = config.siteUrl.replace(/\/$/, '');
  if (config.apiUrl) {
    config.apiUrl = config.apiUrl.replace(/\/$/, '');
  }

  return config;
}

// Fetch recipes from API
async function fetchRecipesFromApi(apiUrl) {
  const url = apiUrl.includes('/recipes') ? apiUrl : `${apiUrl}/recipes`;
  console.log(`  Fetching from: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Generate sitemap XML
function generateSitemap(recipeKeys, siteUrl) {
  const today = new Date().toISOString().split('T')[0];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Static pages -->
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${siteUrl}/search</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;

  // Add recipe pages
  for (const key of recipeKeys) {
    xml += `  <url>
    <loc>${siteUrl}/recipe/${key}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
`;
  }

  xml += '</urlset>\n';

  return xml;
}

// Main function
async function main() {
  const config = parseArgs();

  console.log('Generating sitemap...');
  console.log(`  Site URL: ${config.siteUrl}`);

  let recipeData;

  if (config.useApi && config.apiUrl) {
    // Fetch from API for production sitemap
    console.log('  Source: API');
    try {
      recipeData = await fetchRecipesFromApi(config.apiUrl);
    } catch (error) {
      console.error(`Error fetching from API: ${error.message}`);
      console.log('  Falling back to local data...');
      config.useApi = false;
    }
  }

  if (!config.useApi) {
    // Load local recipe data
    console.log('  Source: Local starter data');
    if (!fs.existsSync(STARTER_DATA_PATH)) {
      console.error(`Error: Recipe data not found at ${STARTER_DATA_PATH}`);
      process.exit(1);
    }
    recipeData = JSON.parse(fs.readFileSync(STARTER_DATA_PATH, 'utf8'));
  }

  const recipeKeys = Object.keys(recipeData);
  console.log(`  Found ${recipeKeys.length} recipes`);

  // Generate sitemap
  const sitemap = generateSitemap(recipeKeys, config.siteUrl);

  // Write sitemap
  fs.writeFileSync(OUTPUT_PATH, sitemap);

  console.log(`  Output: ${OUTPUT_PATH}`);
  console.log(`  Total URLs: ${recipeKeys.length + 2} (2 static + ${recipeKeys.length} recipes)`);
  console.log('Done!');
}

main().catch(error => {
  console.error('Failed to generate sitemap:', error.message);
  process.exit(1);
});
