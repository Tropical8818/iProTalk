import { baseApi } from './baseApi';

export const adminApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        getUsers: builder.query({
            query: () => '/admin/users',
            providesTags: ['User'],
        }),
        getRegistrationSetting: builder.query<{ allow_registration: boolean }, void>({
            query: () => '/admin/config/registration',
        }),
        getServerStats: builder.query<{ total_users: number, total_channels: number, total_messages: number }, void>({
            query: () => '/admin/stats',
        }),
        toggleRegistrationSetting: builder.mutation<string, void>({
            query: () => ({
                url: '/admin/config/registration',
                method: 'PUT',
            }),
        }),
        toggleBan: builder.mutation({
            query: (uid: string) => ({
                url: `/admin/users/${uid}/ban`,
                method: 'PUT',
            }),
            invalidatesTags: ['User'],
        }),
        toggleAdmin: builder.mutation({
            query: (uid: string) => ({
                url: `/admin/users/${uid}/admin`,
                method: 'PUT',
            }),
            invalidatesTags: ['User'],
        }),
        deleteUser: builder.mutation({
            query: (uid: string) => ({
                url: `/admin/users/${uid}`,
                method: 'DELETE',
            }),
            invalidatesTags: ['User'],
        }),
        resetPassword: builder.mutation({
            query: ({ uid, new_password }: { uid: string; new_password: string }) => ({
                url: `/admin/users/${uid}/reset_password`,
                method: 'POST',
                body: { new_password },
            }),
        }),
    }),
});

export const {
    useGetUsersQuery,
    useGetRegistrationSettingQuery,
    useGetServerStatsQuery,
    useToggleRegistrationSettingMutation,
    useToggleBanMutation,
    useToggleAdminMutation,
    useDeleteUserMutation,
    useResetPasswordMutation,
} = adminApi;
