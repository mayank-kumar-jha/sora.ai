'use strict';

const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { aws: awsConfig } = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../config/logger');

const s3Client = new S3Client({
    region: awsConfig.region,
    credentials: {
        accessKeyId: awsConfig.accessKeyId,
        secretAccessKey: awsConfig.secretAccessKey
    }
});

/**
 * Upload a file to S3
 */
const uploadFile = async (key, body, contentType) => {
    try {
        const command = new PutObjectCommand({
            Bucket: awsConfig.bucket,
            Key: key,
            Body: body,
            ContentType: contentType
        });

        await s3Client.send(command);
        return key;
    } catch (error) {
        logger.error('S3 Upload Error', { error: error.message, key });
        throw new AppError(`Failed to upload file to storage: ${error.message}`, 500, 'STORAGE_ERROR');
    }
};

/**
 * Generate a signed URL for a file
 */
const getFileUrl = async (key) => {
    try {
        const command = new GetObjectCommand({
            Bucket: awsConfig.bucket,
            Key: key
        });

        return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    } catch (error) {
        logger.error('S3 Signed URL Error', { error: error.message, key });
        throw new AppError(`Failed to generate signed URL: ${error.message}`, 500, 'STORAGE_ERROR');
    }
};

/**
 * Delete a file from S3
 */
const deleteFile = async (key) => {
    try {
        const command = new DeleteObjectCommand({
            Bucket: awsConfig.bucket,
            Key: key
        });

        await s3Client.send(command);
    } catch (error) {
        logger.error('S3 Delete Error', { error: error.message, key });
        throw new AppError(`Failed to delete file from storage: ${error.message}`, 500, 'STORAGE_ERROR');
    }
};

module.exports = {
    uploadFile,
    getFileUrl,
    deleteFile
};
