import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';

export const useTasks = () => {
    const queryClient = useQueryClient();

    const { data: tasks, isLoading } = useQuery({
        queryKey: ['tasks'],
        queryFn: async () => {
            const response = await apiClient.get('/tasks/list');
            return response.data.data;
        }
    });

    const createTask = useMutation({
        mutationFn: async (task: any) => {
            await apiClient.post('/tasks/create', task);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] })
    });

    const cancelTask = useMutation({
        mutationFn: async (taskId: string) => {
            await apiClient.post('/tasks/cancel', { taskId });
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] })
    });

    return { tasks, isLoading, createTask, cancelTask };
};
