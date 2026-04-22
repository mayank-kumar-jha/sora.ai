'use strict';

const logger = require('../config/logger');

/**
 * Web search using duck-duck-scrape.
 * This handles rate limits, headers, and parsing significantly better than raw HTML fetching.
 */
const search = async (query) => {
  logger.info(`[WebSearch] Searching: "${query}"`);

  try {
    const { search: ddgSearch, SafeSearchType } = require('duck-duck-scrape');
    const searchResults = await ddgSearch(query, {
      safeSearch: SafeSearchType.MODERATE,
    });

    if (!searchResults.results || searchResults.results.length === 0) {
      return { message: `No results found for "${query}". Try a different search term.` };
    }

    const results = searchResults.results.slice(0, 5).map((r) => ({
      snippet: r.description,
      title: r.title,
    }));

    return { query, results };
  } catch (err) {
    logger.warn(`[WebSearch] DDG failed (${err.message}). Using Wikipedia fallback...`);
    return await fallbackSearch(query);
  }
};

/**
 * Fallback to Wikipedia OpenSearch API if DDG blocks the scrape.
 */
const fallbackSearch = async (query) => {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=3&namespace=0&format=json`;
    
    // In Node 18+, fetch is available globally. If not, use https.
    // Using standard https approach for compatibility.
    return new Promise((resolve) => {
      const https = require('https');
      https.get(url, { headers: { 'User-Agent': 'KaayaBot/2.0' } }, (res) => {
        let data = '';
        res.on('data', (c) => data += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (!parsed[1] || parsed[1].length === 0) {
              resolve({ message: `No results found for "${query}".` });
              return;
            }
            
            const results = [];
            for (let i = 0; i < parsed[1].length; i++) {
              results.push({
                title: parsed[1][i],
                snippet: parsed[2][i] || `Information about ${parsed[1][i]}`,
              });
            }
            resolve({ query, results, source: 'Wikipedia' });
          } catch (e) {
            resolve({ error: `Fallback parse failed: ${e.message}` });
          }
        });
      }).on('error', (e) => resolve({ error: `Fallback request failed: ${e.message}` }));
    });
  } catch (err) {
    return { error: `Search failed entirely: ${err.message}` };
  }
};

module.exports = { search };
