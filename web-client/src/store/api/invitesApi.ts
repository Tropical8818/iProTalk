import { baseApi } from './baseApi';

export interface InviteLink {
    code: string;
    created_by: string;
    max_uses: number;
    used_count: number;
    expires_at: string | null;
    created_at: string;
}

export const invitesApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        getInvites: builder.query<InviteLink[], void>({
            query: () => '/admin/invites',
            providesTags: ['InviteLink'],
        }),
        createInvite: builder.mutation<InviteLink, { max_uses?: number; expires_hours?: number }>({
            query: (data) => ({
                url: '/admin/invites',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['InviteLink'],
        }),
        deleteInvite: builder.mutation<string, string>({
            query: (code) => ({
                url: `/admin/invites/${code}`,
                method: 'DELETE',
            }),
            invalidatesTags: ['InviteLink'],
        }),
        validateInvite: builder.query<boolean, string>({
            query: (code) => `/admin/invites/${code}/validate`,
        }),
    }),
});

export const {
    useGetInvitesQuery,
    useCreateInviteMutation,
    useDeleteInviteMutation,
    useValidateInviteQuery,
} = invitesApi;
