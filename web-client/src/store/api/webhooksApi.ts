import { baseApi } from './baseApi';

export interface Webhook {
    id: string;
    name: string;
    channel_id: string;
    secret: string;
    created_by: string;
    created_at: string;
}

export const webhooksApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        getWebhooks: builder.query<Webhook[], void>({
            query: () => '/webhooks',
            providesTags: ['Webhook'],
        }),
        createWebhook: builder.mutation<Webhook, { name: string; channel_id: string }>({
            query: (data) => ({
                url: '/webhooks',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Webhook'],
        }),
        deleteWebhook: builder.mutation<string, string>({
            query: (id) => ({
                url: `/webhooks/${id}`,
                method: 'DELETE',
            }),
            invalidatesTags: ['Webhook'],
        }),
    }),
});

export const {
    useGetWebhooksQuery,
    useCreateWebhookMutation,
    useDeleteWebhookMutation,
} = webhooksApi;
