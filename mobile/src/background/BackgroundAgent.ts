import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { parseNotification } from '../services/NotificationParser';

const AGENT_TASK = 'BACKGROUND_AGENT_TASK';

TaskManager.defineTask(AGENT_TASK, async () => {
  try {
    console.log('Running Background Agent Tasks...');
    // Simulated fetching
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (err) {
    console.error('Background Agent Failed:', err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export const registerBackgroundAgent = async () => {
  try {
    await BackgroundFetch.registerTaskAsync(AGENT_TASK, {
      minimumInterval: 15, // 15 minutes is minimum typically allowed by OS batchers
      stopOnTerminate: false,
      startOnBoot: true,
    });
    console.log('Background Agent Registered');
  } catch (err) {
    console.error('Failed to register Background Agent', err);
  }
};
