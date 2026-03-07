import { baseApi } from './baseApi';

export const channelsApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        getChannels: builder.query({
            query: () => '/channels',
            providesTags: ['Channel'],
        }),
        createChannel: builder.mutation({
            query: (data) => ({
                url: '/channels',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['Channel'],
        }),
        updateChannel: builder.mutation({
            query: ({ id, ...data }) => ({
                url: `/channels/${id}`,
                method: 'PUT',
                body: data,
            }),
            invalidatesTags: ['Channel'],
        }),
        deleteChannel: builder.mutation({
            query: (id) => ({
                url: `/channels/${id}`,
                method: 'DELETE',
            }),
            invalidatesTags: ['Channel'],
        }),
    }),
});

export const {
    useGetChannelsQuery,
    useCreateChannelMutation,
    useUpdateChannelMutation,
    useDeleteChannelMutation,
} = channelsApi;
