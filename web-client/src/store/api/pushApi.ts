import { baseApi } from './baseApi';

export interface VapidKeyResponse {
    public_key: string;
}

export interface PushSubscriptionRequest {
    endpoint: string;
    p256dh: string;
    auth: string;
}

export const pushApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        getVapidKey: builder.query<VapidKeyResponse, void>({
            query: () => '/push/vapid-key',
        }),
        subscribeToPush: builder.mutation<void, PushSubscriptionRequest>({
            query: (body) => ({
                url: '/push/subscribe',
                method: 'POST',
                body,
            }),
        }),
        unsubscribeFromPush: builder.mutation<void, PushSubscriptionRequest>({
            query: (body) => ({
                url: '/push/unsubscribe',
                method: 'POST',
                body,
            }),
        }),
    }),
});

export const {
    useGetVapidKeyQuery,
    useSubscribeToPushMutation,
    useUnsubscribeFromPushMutation,
} = pushApi;
