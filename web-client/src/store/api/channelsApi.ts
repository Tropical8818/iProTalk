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
        getChannelMembers: builder.query({
            query: (id: string) => `/channels/${id}/members`,
        }),
        joinChannel: builder.mutation({
            query: (id: string) => ({
                url: `/channels/${id}/join`,
                method: 'POST',
            }),
        }),
        leaveChannel: builder.mutation({
            query: (id: string) => ({
                url: `/channels/${id}/leave`,
                method: 'POST',
            }),
        }),
        setAnnouncement: builder.mutation({
            query: ({ id, announcement }: { id: string; announcement: string }) => ({
                url: `/channels/${id}/announcement`,
                method: 'PUT',
                body: { announcement },
            }),
        }),
        getAnnouncement: builder.query({
            query: (id: string) => `/channels/${id}/announcement`,
        }),
    }),
});

export const {
    useGetChannelsQuery,
    useCreateChannelMutation,
    useUpdateChannelMutation,
    useDeleteChannelMutation,
    useGetChannelMembersQuery,
    useJoinChannelMutation,
    useLeaveChannelMutation,
    useSetAnnouncementMutation,
    useGetAnnouncementQuery,
} = channelsApi;
