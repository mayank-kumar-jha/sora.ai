'use strict';

const { Pinecone } = require('@pinecone-database/pinecone');
const { vectorDb: vectorDbConfig } = require('../config/env');
const AppError = require('../utils/AppError');

let pc;
let index;

/**
 * Get Pinecone Index instance
 */
const getIndex = () => {
    if (!vectorDbConfig.apiKey || !vectorDbConfig.index) {
        return null; // Return null so callers can handle optionally
    }

    if (!pc) {
        pc = new Pinecone({
            apiKey: vectorDbConfig.apiKey,
        });
        index = pc.index(vectorDbConfig.index);
    }
    return index;
};

/**
 * Upsert a vector into Pinecone
 * @param {string} id - Unique ID for the vector
 * @param {Array<number>} values - The vector values
 * @param {Object} metadata - Metadata associated with the vector
 */
const upsertVector = async (id, values, metadata) => {
    const indexInstance = getIndex();
    if (!indexInstance) {
        console.warn('Pinecone config missing. Skipping memory storage.');
        return;
    }

    if (!id || !values || !values.length) {
        console.warn('Invalid vector data. Skipping upsert.');
        return;
    }

    try {
        const records = [{
            id,
            values: Array.isArray(values) ? values : [],
            metadata: metadata || {}
        }];
        
        if (records[0].values.length === 0) {
            console.warn('[VectorDb] Skipping upsert: empty values array.');
            return;
        }

        await indexInstance.upsert(records);
    } catch (error) {
        console.error('Pinecone Upsert Error:', error);
        // Don't throw here to avoid breaking the main flow if memory fails
    }
};

/**
 * Query Pinecone for similar vectors
 * @param {Array<number>} vector - The query vector
 * @param {string} userId - Filter results by user ID
 * @param {number} topK - Number of results to return
 */
const queryVectors = async (vector, userId, topK = 5) => {
    const indexInstance = getIndex();
    if (!indexInstance) {
        return [];
    }

    try {
        const queryResponse = await indexInstance.query({
            vector,
            topK,
            filter: { userId: { '$eq': userId } },
            includeMetadata: true,
        });

        return queryResponse.matches.map(match => match.metadata);
    } catch (error) {
        console.error('Pinecone Query Error:', error);
        return [];
    }
};

module.exports = {
    upsertVector,
    queryVectors,
};
