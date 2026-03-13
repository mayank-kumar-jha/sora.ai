'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../config/logger');
const AppError = require('../utils/AppError');

/**
 * Perform a web search and return a summary of the top results.
 * This does not require any API keys.
 */
const performWebSearch = async (query) => {
    try {
        logger.info(`Performing web search for: "${query}"`);

        // Try Yahoo First with better headers
        const yahooUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`;
        let response;
        try {
            response = await axios.get(yahooUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Referer': 'https://www.google.com/'
                },
                timeout: 10000
            });
        } catch (yahErr) {
            logger.warn(`Yahoo search failed (${yahErr.message}), trying DuckDuckGo fallback...`);
            const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
            response = await axios.get(ddgUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 10000
            });
        }

        const $ = cheerio.load(response.data);
        const topResults = [];

        // Selector logic for both Yahoo and DDG
        // Yahoo: .algo-sr, .dd.algo, .rel-info
        // DuckDuckGo: .result, .result__body
        const results = $('.algo-sr, .dd.algo, .result, .result__body');

        results.each((i, el) => {
            if (topResults.length >= 3) return false;

            const title = $(el).find('h3, .result__title, .title').first().text().trim();
            const url = $(el).find('a').first().attr('href');
            const snippet = $(el).find('.compText, .result__snippet, .snippet, .fc-falcon').first().text().trim();

            if (title && url) {
                // Clean Yahoo URLs (they often have redirect wrappers)
                let cleanUrl = url;
                if (url.includes('RU=') && url.includes('/RK=2')) {
                    try {
                        const match = url.match(/RU=([^/]+)/);
                        if (match) cleanUrl = decodeURIComponent(match[1]);
                    } catch (e) { }
                }
                topResults.push(`- ${title}: ${snippet.substring(0, 180)}... [Link: ${cleanUrl}]`);
            }
        });

        if (topResults.length === 0) {
            logger.warn(`No results parsed for query: "${query}". Check selectors.`);
            return `I performed a search for "${query}" but couldn't parse any snippets. You might want to try a more specific query.`;
        }

        return `WEB SEARCH RESULTS for "${query}":\n\n${topResults.join('\n')}\n\nPlease summarize.`;

    } catch (error) {
        logger.error(`Web search failed: ${error.message}`);
        return `I couldn't search the web right now: ${error.message}`;
    }
};

module.exports = {
    performWebSearch
};
